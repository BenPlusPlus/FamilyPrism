using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace prismshared;

public sealed class PrismApiClient
{
    private readonly HttpClient httpClient;

    public PrismApiClient(HttpClient? httpClient = null)
    {
        this.httpClient = httpClient ?? new HttpClient();
    }

    public async Task<(string ServerBaseUrl, PrismRegistrationResult Registration)> RegisterAsync(
        string serverInput,
        string clientName,
        string registrationCode,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(clientName))
        {
            throw new InvalidOperationException("A device name is required.");
        }

        if (string.IsNullOrWhiteSpace(registrationCode))
        {
            throw new InvalidOperationException("A registration code is required.");
        }

        var serverBaseUrl = NormalizeServerBaseUrl(serverInput);
        var endpoint = new Uri(new Uri(serverBaseUrl), "api/clients/register");

        using var response = await httpClient.PostAsJsonAsync(
            endpoint,
            new
            {
                clientName = clientName.Trim(),
                registrationPassword = registrationCode.Trim()
            },
            cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw await CreateRegistrationExceptionAsync(response, cancellationToken);
        }

        var registration = await response.Content.ReadFromJsonAsync<PrismRegistrationResult>(cancellationToken: cancellationToken)
            ?? throw new InvalidOperationException("The registration API returned an empty response.");

        return (serverBaseUrl, registration);
    }

    public static string NormalizeServerBaseUrl(string serverInput)
    {
        var trimmed = serverInput.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            throw new InvalidOperationException("A server name or URL is required.");
        }

        if (!trimmed.Contains("://", StringComparison.Ordinal))
        {
            trimmed = $"https://{trimmed}";
        }

        if (!Uri.TryCreate(trimmed, UriKind.Absolute, out var uri))
        {
            throw new InvalidOperationException("The server value is not a valid URL.");
        }

        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
        {
            throw new InvalidOperationException("Only HTTP and HTTPS server URLs are supported.");
        }

        var builder = new UriBuilder(uri)
        {
            Query = string.Empty,
            Fragment = string.Empty
        };

        if (!builder.Path.EndsWith("/", StringComparison.Ordinal))
        {
            builder.Path = $"{builder.Path}/";
        }

        return builder.Uri.ToString();
    }

    private static async Task<PrismRegistrationException> CreateRegistrationExceptionAsync(
        HttpResponseMessage response,
        CancellationToken cancellationToken)
    {
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        var errorMessage = body;

        if (!string.IsNullOrWhiteSpace(body))
        {
            try
            {
                var payload = JsonSerializer.Deserialize<PrismRegistrationErrorResponse>(
                    body,
                    new JsonSerializerOptions(JsonSerializerDefaults.Web));

                errorMessage = payload?.Message
                    ?? payload?.Error
                    ?? body;
            }
            catch (JsonException)
            {
            }
        }

        var userMessage = response.StatusCode switch
        {
            HttpStatusCode.Conflict => "That device name is already registered on this server. Choose a different device name and try again.",
            HttpStatusCode.Unauthorized => "The registration code was not accepted by the server.",
            _ when !string.IsNullOrWhiteSpace(errorMessage) => errorMessage,
            _ => $"The server returned {(int)response.StatusCode} ({response.ReasonPhrase})."
        };

        return new PrismRegistrationException(userMessage, response.StatusCode);
    }
}

public sealed class PrismRegistrationException : Exception
{
    public PrismRegistrationException(string message, HttpStatusCode? statusCode)
        : base(message)
    {
        StatusCode = statusCode;
    }

    public HttpStatusCode? StatusCode { get; }
}
