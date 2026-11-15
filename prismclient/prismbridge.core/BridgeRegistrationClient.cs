using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using prismshared;

namespace prismbridge;

public sealed record BridgeRegistration(string BridgeId, string BridgeName, string Credential, string WebsocketPath);

public sealed class BridgeRegistrationClient(HttpClient? httpClient = null)
{
    private readonly HttpClient http = httpClient ?? new HttpClient { Timeout = TimeSpan.FromSeconds(30) };

    /// <summary>Registers with the same password as Clients (docs/router-bridge.md). Returns the normalized server URL.</summary>
    public async Task<(string ServerBaseUrl, BridgeRegistration Registration)> RegisterAsync(
        string serverInput,
        string bridgeName,
        string registrationPassword,
        CancellationToken cancellationToken)
    {
        var serverBaseUrl = PrismApiClient.NormalizeServerBaseUrl(serverInput);
        using var response = await http.PostAsJsonAsync(
            new Uri(new Uri(serverBaseUrl), "api/bridges/register"),
            new { bridgeName = bridgeName.Trim(), registrationPassword = registrationPassword.Trim() },
            cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(response.StatusCode switch
            {
                HttpStatusCode.Forbidden => "The server didn't accept the registration password.",
                HttpStatusCode.Conflict => "A Router bridge is already registered. Remove it in the console under Settings › Router bridge, then run setup again.",
                _ => await ReadMessageAsync(response, cancellationToken)
                    ?? $"The server returned {(int)response.StatusCode} ({response.ReasonPhrase})."
            });
        }

        var registration = await response.Content.ReadFromJsonAsync<BridgeRegistration>(cancellationToken)
            ?? throw new InvalidOperationException("The server returned an empty registration.");
        return (serverBaseUrl, registration);
    }

    private static async Task<string?> ReadMessageAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        try
        {
            using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
            return document.RootElement.TryGetProperty("message", out var message) ? message.GetString() : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
