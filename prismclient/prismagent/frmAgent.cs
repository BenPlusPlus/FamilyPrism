using prismshared;

namespace prismagent;

public partial class frmAgent : Form
{
    public frmAgent()
    {
        InitializeComponent();
    }

    public void ApplyStatus(PrismStatusSnapshot status)
    {
        txtSetupComplete.Text = status.IsSetupComplete ? "Yes" : "No";
        txtHostMode.Text = status.HostMode;
        txtConnectionState.Text = status.ConnectionState.ToString();
        txtStatusMessage.Text = ValueOrPlaceholder(status.StatusMessage);
        txtServer.Text = ValueOrPlaceholder(status.ServerBaseUrl);
        txtClientName.Text = ValueOrPlaceholder(status.ClientName);
        txtClientId.Text = ValueOrPlaceholder(status.ClientId);
        txtLastConnected.Text = status.LastConnectedAtUtc?.ToLocalTime().ToString("g") ?? "(not connected)";
        txtLastMessage.Text = ValueOrPlaceholder(status.LastMessageText);
        txtLastError.Text = ValueOrPlaceholder(status.LastError);
        txtLastUpdated.Text = status.UpdatedAtUtc.ToLocalTime().ToString("g");
    }

    private static string ValueOrPlaceholder(string? value)
    {
        return string.IsNullOrWhiteSpace(value)
            ? "(not available)"
            : value;
    }
}
