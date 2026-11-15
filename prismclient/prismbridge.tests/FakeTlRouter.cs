using System.Net;
using System.Numerics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace prismbridge.tests;

/// <summary>
/// An in-memory TL-R600VPN v4 that behaves like the real one as recorded in
/// docs/router-bridge-tl-r600vpn.md: browser headers required, a stok token and sysauth cookie,
/// a raw-RSA password, and a table edited by position.
/// </summary>
internal sealed class FakeTlRouter : HttpMessageHandler
{
    private const string Stok = "f4k3st0k";
    private const string Cookie = "sysauth=c00k1e";
    private readonly BigInteger modulus;
    private readonly BigInteger exponent;
    private readonly BigInteger privateExponent;
    private readonly string modulusHex;
    private bool signedIn;

    public FakeTlRouter(string username = "admin", string password = "router-pass")
    {
        Username = username;
        Password = password;
        using var rsa = RSA.Create(1024);
        var key = rsa.ExportParameters(includePrivateParameters: true);
        modulus = new BigInteger(key.Modulus, isUnsigned: true, isBigEndian: true);
        exponent = new BigInteger(key.Exponent, isUnsigned: true, isBigEndian: true);
        privateExponent = new BigInteger(key.D, isUnsigned: true, isBigEndian: true);
        modulusHex = Convert.ToHexString(key.Modulus!);
    }

    public string Username { get; }

    public string Password { get; set; }

    public List<RouterEntry> Entries { get; } = [];

    public string FilterMode { get; set; } = "black";

    public string HostMac { get; set; } = "10-00-00-AA-BB-CC";

    public int MaxRules { get; set; } = 80;

    public int Logins { get; private set; }

    public int Logouts { get; private set; }

    /// <summary>When set, the next table read answers 704 as if the session were replaced.</summary>
    public bool ExpireNextRead { get; set; }

    public bool Offline { get; set; }

    /// <summary>Decrypts like the router: raw RSA, then the password bytes before the zero fill.</summary>
    public string Decrypt(string hex)
    {
        var plain = BigInteger.ModPow(BigInteger.Parse("0" + hex, System.Globalization.NumberStyles.HexNumber), privateExponent, modulus);
        var bytes = plain.ToByteArray(isUnsigned: true, isBigEndian: true);
        var padded = new byte[modulusHex.Length / 2 - bytes.Length].Concat(bytes).ToArray();
        return Encoding.ASCII.GetString(padded).TrimEnd('\0');
    }

    public (string ModulusHex, string ExponentHex) PublicKey =>
        (modulusHex, Convert.ToHexString(exponent.ToByteArray(isUnsigned: true, isBigEndian: true)));

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        if (Offline)
        {
            throw new HttpRequestException("No route to host.");
        }

        if (!request.Headers.TryGetValues("X-Requested-With", out _) || request.Headers.Referrer is null)
        {
            return new HttpResponseMessage(HttpStatusCode.NotFound) { Content = new StringContent("<h1>Not Found</h1>") };
        }

        var path = request.RequestUri!.PathAndQuery;
        var body = await request.Content!.ReadAsStringAsync(cancellationToken);
        var data = JsonNode.Parse(WebUtility.UrlDecode(body["data=".Length..]))!;
        var method = data["method"]!.GetValue<string>();

        if (path.EndsWith("/login?form=login", StringComparison.Ordinal))
        {
            return method == "get" ? Ok(new { username = "", password = new[] { PublicKey.ModulusHex, PublicKey.ExponentHex } }) : Login(data);
        }

        var cookie = request.Headers.TryGetValues("Cookie", out var cookies) ? string.Join(';', cookies) : string.Empty;
        if (!signedIn || !path.StartsWith($"/cgi-bin/luci/;stok={Stok}/", StringComparison.Ordinal) || cookie != Cookie)
        {
            return Json(new { error_code = "704" });
        }

        if (path.EndsWith("/admin/system?form=logout", StringComparison.Ordinal))
        {
            signedIn = false;
            Logouts++;
            return Ok(new { });
        }

        if (path.EndsWith("/admin/mac_filter?form=mode", StringComparison.Ordinal))
        {
            return Ok(new { enable = "on", filter_mode = FilterMode, interfaces = new[] { "LAN" }, host_mac = HostMac });
        }

        if (!path.EndsWith("/admin/mac_filter?form=mac_list", StringComparison.Ordinal))
        {
            return Json(new { error_code = "1014" });
        }

        switch (method)
        {
            case "get":
                if (ExpireNextRead)
                {
                    ExpireNextRead = false;
                    signedIn = false;
                    return Json(new { error_code = "704" });
                }

                return Json(new
                {
                    id = 1,
                    others = new { max_rules = MaxRules },
                    result = Entries.Select(entry => new { name = entry.Name, mac = entry.Mac }),
                    error_code = "0"
                });
            case "add":
                var parameters = data["params"]!;
                // Like the real router: the flat shape is ignored without an error code.
                if (parameters["old"]?.GetValue<string>() != "add" || parameters["new"] is not { } added)
                {
                    return Json(new { });
                }

                var entry = new RouterEntry(added["name"]!.GetValue<string>(), added["mac"]!.GetValue<string>().ToUpperInvariant());
                Entries.Insert(Math.Min(parameters["index"]!.GetValue<int>(), Entries.Count), entry);
                return Ok(new { name = entry.Name, mac = entry.Mac });
            case "delete":
                var index = int.Parse(data["params"]!["index"]!.GetValue<string>());
                Entries.RemoveAt(index);
                return Ok(new[] { new { index = index.ToString(), success = true } });
            default:
                return Json(new { error_code = "1014" });
        }
    }

    private HttpResponseMessage Login(JsonNode data)
    {
        var parameters = data["params"]!;
        var hex = parameters["password"]!.GetValue<string>();
        if (hex.Length != modulusHex.Length
            || parameters["username"]!.GetValue<string>() != Username
            || Decrypt(hex) != Password)
        {
            return Json(new { id = 1, result = new { failureCount = 1, attemptsAllowed = 9 }, error_code = "700" });
        }

        signedIn = true;
        Logins++;
        var response = Ok(new { stok = Stok });
        response.Headers.Add("Set-Cookie", $"{Cookie}; path=/cgi-bin/luci/");
        return response;
    }

    private static HttpResponseMessage Ok(object result) => Json(new { id = 1, result, error_code = "0" });

    private static HttpResponseMessage Json(object body) => new(HttpStatusCode.OK)
    {
        Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "text/html")
    };
}
