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

        foreach (var textBox in new[] { txtLastUpdateCheck, txtLastMessage, txtLastError })
        {
            FitHeight(textBox);
            textBox.SizeChanged += (_, _) => FitHeight(textBox);
        }

        // The window is as tall as its content; long values wrap, then truncate with a tooltip.
        layoutPanel.SizeChanged += (_, _) => ClientSize = new Size(ClientSize.Width, layoutPanel.Height);
        ClientSize = new Size(ClientSize.Width, layoutPanel.Height);
    }

    public void ApplyStatus(PrismStatusSnapshot status)
    {
        lblClientNameHeader.Text = string.IsNullOrWhiteSpace(status.ClientName) ? "Family Prism" : status.ClientName;
        var (badgeText, badgeColor) = DescribeConnection(status.ConnectionState);
        lblConnectionBadge.Text = $"● {badgeText}";
        lblConnectionBadge.ForeColor = badgeColor;
        SetValue(txtStatusMessage, ValueOrPlaceholder(status.StatusMessage));

        SetValue(txtServer, ValueOrPlaceholder(status.ServerBaseUrl));
        SetValue(txtClientId, ValueOrPlaceholder(status.ClientId));
        SetValue(txtLastConnected, status.LastConnectedAtUtc is DateTimeOffset connectedAt ? FormatTimestamp(connectedAt) : "Never");
        SetValue(txtSetupComplete, status.IsSetupComplete ? "Complete" : "Not complete");
        SetValue(txtHostMode, DescribeHostMode(status.HostMode));
        SetValue(txtLastUpdated, FormatTimestamp(status.UpdatedAtUtc));
        SetValue(txtAgentVersion, DescribeVersion(status.AgentVersion));

        SetValue(txtLastMessage, string.IsNullOrWhiteSpace(status.LastMessageText) ? "None" : status.LastMessageText);
        txtLastMessage.ForeColor = string.IsNullOrWhiteSpace(status.LastMessageText) ? SystemColors.GrayText : SystemColors.ControlText;

        var hasError = !string.IsNullOrWhiteSpace(status.LastError);
        SetValue(txtLastError, hasError ? status.LastError! : "None");
        txtLastError.ForeColor = hasError ? ErrorColor : SystemColors.GrayText;

        ApplyUpdateCheckStatus(status);
    }

    private static readonly Color ConnectedColor = Color.FromArgb(16, 124, 16);
    private static readonly Color PendingColor = Color.FromArgb(157, 93, 0);
    private static readonly Color ErrorColor = Color.FromArgb(196, 43, 28);

    private static (string Text, Color Color) DescribeConnection(PrismConnectionState state)
    {
        return state switch
        {
            PrismConnectionState.Connected => ("Connected", ConnectedColor),
            PrismConnectionState.Connecting => ("Connecting", PendingColor),
            PrismConnectionState.Starting => ("Starting", PendingColor),
            PrismConnectionState.Configured => ("Configured", PendingColor),
            PrismConnectionState.Disconnected => ("Disconnected", PendingColor),
            PrismConnectionState.Error => ("Error", ErrorColor),
            _ => ("Not configured", SystemColors.GrayText)
        };
    }

    private static string DescribeHostMode(string hostMode)
    {
        return hostMode switch
        {
            "WindowsService" => "Windows service",
            "Process" => "Process (debug)",
            _ => hostMode
        };
    }

    private static string FormatTimestamp(DateTimeOffset value)
    {
        var local = value.ToLocalTime();
        return local.Date == DateTime.Today
            ? $"Today, {local:t}"
            : local.ToString("g");
    }

    /// <summary>Only touches the control when the text changes, so a selection survives the 2-second refresh.</summary>
    private void SetValue(TextBox textBox, string text)
    {
        if (string.Equals(textBox.Text, text, StringComparison.Ordinal))
        {
            return;
        }

        textBox.Text = text;
        toolTip.SetToolTip(textBox, text);
        FitHeight(textBox);
    }

    /// <summary>Sizes a wrapping value to its text, between one line and the maximum in its Tag.</summary>
    private static void FitHeight(TextBox textBox)
    {
        if (!textBox.Multiline || textBox.Tag is not int maxLines)
        {
            return;
        }

        const TextFormatFlags flags = TextFormatFlags.WordBreak | TextFormatFlags.TextBoxControl;

        // The edit control's line spacing, which is a little less than Font.Height.
        var lineHeight = TextRenderer.MeasureText("Ag", textBox.Font, new Size(int.MaxValue, int.MaxValue), flags).Height;
        var width = Math.Max(1, textBox.ClientSize.Width - 6);
        var measured = TextRenderer.MeasureText(
            textBox.Text.Length == 0 ? " " : textBox.Text,
            textBox.Font,
            new Size(width, int.MaxValue),
            flags);
        var lines = Math.Clamp((int)Math.Ceiling(measured.Height / (double)lineHeight), 1, maxLines);
        var height = (lines * lineHeight) + 2;
        if (textBox.Height != height)
        {
            textBox.Height = height;
        }
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
                SetValue(txtLastUpdateCheck, "Waiting for the Family Prism service...");
                return;
            }
        }

        if (showingNoResponseNotice)
        {
            if (status.LastUpdateCheckAtUtc == noResponseNoticeStatusAt)
            {
                SetValue(txtLastUpdateCheck, "The Family Prism service did not respond. Make sure it is running.");
                return;
            }

            showingNoResponseNotice = false;
        }

        SetValue(txtLastUpdateCheck, status.LastUpdateCheckAtUtc is DateTimeOffset at
            ? $"{FormatTimestamp(at)}: {ValueOrPlaceholder(status.LastUpdateCheckResult)}"
            : "No update check yet");
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
        SetValue(txtLastUpdateCheck, "Waiting for the Family Prism service...");
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
