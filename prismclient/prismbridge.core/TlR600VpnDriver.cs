using System.Globalization;
using System.Net.Http.Headers;
using System.Numerics;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace prismbridge;

/// <summary>
/// TP-Link TL-R600VPN v4 (firmware 4.0.3). The web UI is a JSON API over form posts; see
/// docs/router-bridge-tl-r600vpn.md for everything this relies on.
/// </summary>
public sealed class TlR600VpnDriver(
    Uri routerBaseUri,
    string username,
    string password,
    HttpMessageHandler? handler = null) : IRouterDriver
{
    public const string ModelName = "TL-R600VPN v4";

    private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(15);

    public string Model => ModelName;

    public async Task<IRouterSession> OpenAsync(CancellationToken cancellationToken)
    {
        var http = handler is null
            ? new HttpClient(new HttpClientHandler { UseCookies = false })
            : new HttpClient(handler, disposeHandler: false);
        http.Timeout = RequestTimeout;
        http.BaseAddress = routerBaseUri;

        try
        {
            var session = new Session(http, routerBaseUri);
            await session.LoginAsync(username, password, cancellationToken);
            return session;
        }
        catch
        {
            http.Dispose();
            throw;
        }
    }

    /// <summary>
    /// The router's own "nopadding" RSA: the ASCII password at the start of a block the size of the
    /// modulus, zero-filled, raised to e mod n, as lowercase hex left-padded to the modulus width.
    /// </summary>
    internal static string EncryptPassword(string password, string modulusHex, string exponentHex)
    {
        var modulus = ParseHex(modulusHex);
        var exponent = ParseHex(exponentHex);
        var width = (modulusHex.Length + 1) / 2;
        var passwordBytes = Encoding.ASCII.GetBytes(password);
        if (passwordBytes.Length >= width)
        {
            throw new RouterException(BridgeFailureCode.Unexpected, "The router password is too long to encrypt.");
        }

        var block = new byte[width];
        passwordBytes.CopyTo(block, 0);
        var cipher = BigInteger.ModPow(new BigInteger(block, isUnsigned: true, isBigEndian: true), exponent, modulus);
        var hex = Convert.ToHexStringLower(cipher.ToByteArray(isUnsigned: true, isBigEndian: true));
        return hex.PadLeft(width * 2, '0');
    }

    private static BigInteger ParseHex(string hex) =>
        BigInteger.Parse("0" + hex, NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture);

    private sealed class Session(HttpClient http, Uri routerBaseUri) : IRouterSession
    {
        private string stok = string.Empty;
        private string? sysauthCookie;

        public async Task LoginAsync(string username, string password, CancellationToken cancellationToken)
        {
            var keys = await PostAsync("/login?form=login", new { method = "get", @params = new { } }, cancellationToken, allowLoginErrors: true);
            var key = keys["result"]?["password"]?.AsArray()
                ?? throw new RouterException(BridgeFailureCode.Unexpected, "The router didn't send its login key.");
            var encrypted = EncryptPassword(password, key[0]!.GetValue<string>(), key[1]!.GetValue<string>());

            var login = await PostAsync(
                "/login?form=login",
                new { method = "login", @params = new { username, password = encrypted } },
                cancellationToken,
                allowLoginErrors: true);
            stok = login["result"]?["stok"]?.GetValue<string>()
                ?? throw new RouterException(BridgeFailureCode.Unexpected, "The router didn't return a session token.");
        }

        public async Task<RouterTable> ReadTableAsync(CancellationToken cancellationToken)
        {
            var mode = (await PostAsync("/admin/mac_filter?form=mode", new { method = "get" }, cancellationToken))["result"];
            if (mode?["enable"]?.GetValue<string>() != "on")
            {
                throw new RouterException(BridgeFailureCode.Unexpected, "MAC filtering is turned off on the router, so blocks have no effect.");
            }

            // In allowlist mode an entry lets a device in, so adding one would do the opposite of blocking.
            if (mode["filter_mode"]?.GetValue<string>() != "black")
            {
                throw new RouterException(BridgeFailureCode.Unexpected, "The router's MAC filter isn't in blocklist mode, so the bridge won't change it.");
            }

            var list = await PostAsync("/admin/mac_filter?form=mac_list", new { method = "get", @params = new { } }, cancellationToken);
            var entries = (list["result"]?.AsArray() ?? [])
                .Select(entry => new RouterEntry(
                    entry?["name"]?.GetValue<string>() ?? string.Empty,
                    entry?["mac"]?.GetValue<string>() ?? string.Empty))
                .ToList();
            var maxRules = list["others"]?["max_rules"]?.GetValue<int>() ?? 80;

            return new RouterTable(entries, maxRules, mode["host_mac"]?.GetValue<string>());
        }

        public async Task AddAsync(int index, string name, string mac, CancellationToken cancellationToken)
        {
            // Sending name and mac flat in params is silently ignored; the UI's old/new shape is required.
            var response = await PostAsync(
                "/admin/mac_filter?form=mac_list",
                new { method = "add", @params = new { index, old = "add", @new = new { name, mac }, key = "add" } },
                cancellationToken);
            if (response["result"]?["mac"]?.GetValue<string>() is null)
            {
                throw new RouterException(BridgeFailureCode.Unexpected, "The router didn't confirm the new entry.");
            }
        }

        public async Task DeleteAsync(int index, CancellationToken cancellationToken)
        {
            var position = index.ToString(CultureInfo.InvariantCulture);
            var response = await PostAsync(
                "/admin/mac_filter?form=mac_list",
                new { method = "delete", @params = new { key = $"key-{position}", index = position } },
                cancellationToken);
            if (response["result"]?[0]?["success"]?.GetValue<bool>() != true)
            {
                throw new RouterException(BridgeFailureCode.Unexpected, "The router didn't confirm the delete.");
            }
        }

        public async ValueTask DisposeAsync()
        {
            try
            {
                if (stok.Length > 0)
                {
                    using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
                    await PostAsync("/admin/system?form=logout", new { method = "set" }, timeout.Token);
                }
            }
            catch
            {
                // The session times out on the router anyway; a failed logout isn't worth reporting.
            }
            finally
            {
                http.Dispose();
            }
        }

        private async Task<JsonNode> PostAsync(
            string path,
            object payload,
            CancellationToken cancellationToken,
            bool allowLoginErrors = false)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, $"/cgi-bin/luci/;stok={stok}{path}")
            {
                Content = new FormUrlEncodedContent([new("data", JsonSerializer.Serialize(payload))])
            };
            request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/x-www-form-urlencoded") { CharSet = "UTF-8" };
            // Without these two headers the router answers 404.
            request.Headers.Add("X-Requested-With", "XMLHttpRequest");
            request.Headers.Referrer = new Uri(routerBaseUri, "/webpages/index.html");
            if (sysauthCookie is not null)
            {
                request.Headers.Add("Cookie", sysauthCookie);
            }

            HttpResponseMessage response;
            try
            {
                response = await http.SendAsync(request, cancellationToken);
            }
            catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException && !cancellationToken.IsCancellationRequested)
            {
                throw new RouterException(BridgeFailureCode.Unreachable, "The bridge can't reach the router.", exception);
            }

            using (response)
            {
                if (response.Headers.TryGetValues("Set-Cookie", out var cookies)
                    && cookies.Select(cookie => cookie.Split(';', 2)[0]).FirstOrDefault(cookie => cookie.StartsWith("sysauth=", StringComparison.Ordinal)) is { } sysauth)
                {
                    sysauthCookie = sysauth;
                }

                var body = await response.Content.ReadAsStringAsync(cancellationToken);
                JsonNode? json;
                try
                {
                    json = JsonNode.Parse(body);
                }
                catch (JsonException)
                {
                    json = null;
                }

                if (json is null)
                {
                    throw new RouterException(
                        BridgeFailureCode.Unexpected,
                        $"The router answered {(int)response.StatusCode} without JSON. Is this a {ModelName}?");
                }

                var code = json["error_code"]?.ToString();
                switch (code)
                {
                    case "0":
                        return json;
                    case "704":
                        throw new RouterSessionExpiredException();
                    case "700" when allowLoginErrors:
                        throw new RouterException(BridgeFailureCode.LoginFailed, "The router turned down the username or password.");
                    case "709" when allowLoginErrors:
                        throw new RouterException(BridgeFailureCode.LockedOut, "The router locked its admin login after too many failed tries.");
                    case "710" when allowLoginErrors:
                        throw new RouterException(BridgeFailureCode.RouterBusy, "Someone else is signed in to the router's admin page.");
                    default:
                        throw new RouterException(BridgeFailureCode.Unexpected, $"The router returned error {code} for {path.Split('?')[0]}.");
                }
            }
        }
    }
}
