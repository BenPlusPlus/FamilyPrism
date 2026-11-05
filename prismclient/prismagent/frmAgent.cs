using prismshared;

namespace prismagent;

public partial class frmAgent : Form
{
    private static readonly TimeSpan UpdateCheckResponseTimeout = TimeSpan.FromSeconds(60);

    private readonly string trayVersion = PrismAgentRuntime.GetAssemblyVersion();
    private DateTimeOffset? updateCheckRequestedAtUtc;
    private bool showingNoResponseNotice;
    private DateTimeOffset? noResponseNoticeStatusAt;

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
        txtAgentVersion.Text = DescribeVersion(status.AgentVersion);
        ApplyUpdateCheckStatus(status);
    }

    private string DescribeVersion(string? serviceVersion)
    {
        if (string.IsNullOrWhiteSpace(serviceVersion))
        {
            return $"{trayVersion} (service version not reported yet)";
        }

        return string.Equals(serviceVersion, trayVersion, StringComparison.OrdinalIgnoreCase)
            ? serviceVersion
            : $"{serviceVersion} (tray {trayVersion})";
    }

    private void ApplyUpdateCheckStatus(PrismStatusSnapshot status)
    {
        if (updateCheckRequestedAtUtc is DateTimeOffset requestedAt)
        {
            var answered = status.LastUpdateCheckAtUtc is DateTimeOffset checkedAt
                && checkedAt >= requestedAt
                && !IsInProgressMessage(status.LastUpdateCheckResult);

            if (answered)
            {
                EndUpdateCheck();
            }
            else if (DateTimeOffset.UtcNow - requestedAt > UpdateCheckResponseTimeout)
            {
                EndUpdateCheck();
                showingNoResponseNotice = true;
                noResponseNoticeStatusAt = status.LastUpdateCheckAtUtc;
            }
            else if (status.LastUpdateCheckAtUtc is not DateTimeOffset pickedUpAt || pickedUpAt < requestedAt)
            {
                txtLastUpdateCheck.Text = "Waiting for the Family Prism service...";
                return;
            }
        }

        if (showingNoResponseNotice)
        {
            if (status.LastUpdateCheckAtUtc == noResponseNoticeStatusAt)
            {
                txtLastUpdateCheck.Text = "The Family Prism service did not respond. Make sure it is running.";
                return;
            }

            showingNoResponseNotice = false;
        }

        txtLastUpdateCheck.Text = status.LastUpdateCheckAtUtc is DateTimeOffset at
            ? $"{at.ToLocalTime():g}: {ValueOrPlaceholder(status.LastUpdateCheckResult)}"
            : "(no update check yet)";
    }

    private void btnCheckForUpdates_Click(object? sender, EventArgs e)
    {
        var now = DateTimeOffset.UtcNow;
        try
        {
            UpdateCheckRequestStore.Write(now);
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                this,
                $"The update check could not be requested: {ex.Message}",
                "Family Prism",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return;
        }

        updateCheckRequestedAtUtc = now;
        showingNoResponseNotice = false;
        btnCheckForUpdates.Enabled = false;
        btnCheckForUpdates.Text = "Checking...";
        txtLastUpdateCheck.Text = "Waiting for the Family Prism service...";
    }

    private void EndUpdateCheck()
    {
        updateCheckRequestedAtUtc = null;
        btnCheckForUpdates.Enabled = true;
        btnCheckForUpdates.Text = "Check for updates";
    }

    private static bool IsInProgressMessage(string? result)
    {
        return string.Equals(result, UpdateCheckRequestStore.InProgressMessage, StringComparison.Ordinal);
    }

    private static string ValueOrPlaceholder(string? value)
    {
        return string.IsNullOrWhiteSpace(value)
            ? "(not available)"
            : value;
    }
}
