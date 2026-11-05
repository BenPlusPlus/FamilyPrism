namespace prismagent;

partial class frmAgent
{
    private System.ComponentModel.IContainer components = null;
    private TableLayoutPanel layoutPanel;
    private Label lblClientNameHeader;
    private Label lblConnectionBadge;
    private TextBox txtStatusMessage;
    private Label lblConnectionSection;
    private Label lblServer;
    private TextBox txtServer;
    private Label lblClientId;
    private TextBox txtClientId;
    private Label lblLastConnected;
    private TextBox txtLastConnected;
    private Label lblSetupComplete;
    private TextBox txtSetupComplete;
    private Label lblHostMode;
    private TextBox txtHostMode;
    private Label lblLastUpdated;
    private TextBox txtLastUpdated;
    private Label lblVersionSection;
    private Label lblAgentVersion;
    private TextBox txtAgentVersion;
    private Button btnCheckForUpdates;
    private Label lblLastUpdateCheck;
    private TextBox txtLastUpdateCheck;
    private Label lblActivitySection;
    private Label lblLastMessage;
    private TextBox txtLastMessage;
    private Label lblLastError;
    private TextBox txtLastError;
    private ToolTip toolTip;

    protected override void Dispose(bool disposing)
    {
        if (disposing && (components != null))
        {
            components.Dispose();
        }
        base.Dispose(disposing);
    }

    #region Windows Form Designer generated code

    private void InitializeComponent()
    {
        components = new System.ComponentModel.Container();
        layoutPanel = new TableLayoutPanel();
        lblClientNameHeader = new Label();
        lblConnectionBadge = new Label();
        txtStatusMessage = new TextBox();
        lblConnectionSection = new Label();
        lblServer = new Label();
        txtServer = new TextBox();
        lblClientId = new Label();
        txtClientId = new TextBox();
        lblLastConnected = new Label();
        txtLastConnected = new TextBox();
        lblSetupComplete = new Label();
        txtSetupComplete = new TextBox();
        lblHostMode = new Label();
        txtHostMode = new TextBox();
        lblLastUpdated = new Label();
        txtLastUpdated = new TextBox();
        lblVersionSection = new Label();
        lblAgentVersion = new Label();
        txtAgentVersion = new TextBox();
        btnCheckForUpdates = new Button();
        lblLastUpdateCheck = new Label();
        txtLastUpdateCheck = new TextBox();
        lblActivitySection = new Label();
        lblLastMessage = new Label();
        txtLastMessage = new TextBox();
        lblLastError = new Label();
        txtLastError = new TextBox();
        toolTip = new ToolTip(components);
        layoutPanel.SuspendLayout();
        SuspendLayout();
        //
        // layoutPanel
        //
        // Four columns: label | value | label | value. Full-width values span columns 1-3.
        layoutPanel.ColumnCount = 4;
        layoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 96F));
        layoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50F));
        layoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 64F));
        layoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50F));
        layoutPanel.AutoSize = true;
        layoutPanel.AutoSizeMode = AutoSizeMode.GrowAndShrink;
        layoutPanel.Dock = DockStyle.Top;
        layoutPanel.Name = "layoutPanel";
        layoutPanel.Padding = new Padding(14, 10, 14, 12);
        layoutPanel.RowCount = 14;
        for (var row = 0; row < layoutPanel.RowCount; row++)
        {
            layoutPanel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        }
        layoutPanel.TabIndex = 0;

        // Header: client name + connection badge, then the status message.
        layoutPanel.Controls.Add(lblClientNameHeader, 0, 0);
        layoutPanel.SetColumnSpan(lblClientNameHeader, 3);
        layoutPanel.Controls.Add(lblConnectionBadge, 3, 0);
        layoutPanel.Controls.Add(txtStatusMessage, 0, 1);
        layoutPanel.SetColumnSpan(txtStatusMessage, 4);

        // Connection
        layoutPanel.Controls.Add(lblConnectionSection, 0, 2);
        layoutPanel.SetColumnSpan(lblConnectionSection, 4);
        layoutPanel.Controls.Add(lblServer, 0, 3);
        layoutPanel.Controls.Add(txtServer, 1, 3);
        layoutPanel.SetColumnSpan(txtServer, 3);
        layoutPanel.Controls.Add(lblClientId, 0, 4);
        layoutPanel.Controls.Add(txtClientId, 1, 4);
        layoutPanel.SetColumnSpan(txtClientId, 3);
        layoutPanel.Controls.Add(lblLastConnected, 0, 5);
        layoutPanel.Controls.Add(txtLastConnected, 1, 5);
        layoutPanel.Controls.Add(lblSetupComplete, 2, 5);
        layoutPanel.Controls.Add(txtSetupComplete, 3, 5);
        layoutPanel.Controls.Add(lblLastUpdated, 0, 6);
        layoutPanel.Controls.Add(txtLastUpdated, 1, 6);
        layoutPanel.Controls.Add(lblHostMode, 2, 6);
        layoutPanel.Controls.Add(txtHostMode, 3, 6);

        // Version
        layoutPanel.Controls.Add(lblVersionSection, 0, 7);
        layoutPanel.SetColumnSpan(lblVersionSection, 4);
        layoutPanel.Controls.Add(lblAgentVersion, 0, 8);
        layoutPanel.Controls.Add(txtAgentVersion, 1, 8);
        layoutPanel.SetColumnSpan(txtAgentVersion, 2);
        layoutPanel.Controls.Add(btnCheckForUpdates, 3, 8);
        layoutPanel.Controls.Add(lblLastUpdateCheck, 0, 9);
        layoutPanel.Controls.Add(txtLastUpdateCheck, 1, 9);
        layoutPanel.SetColumnSpan(txtLastUpdateCheck, 3);

        // Activity
        layoutPanel.Controls.Add(lblActivitySection, 0, 10);
        layoutPanel.SetColumnSpan(lblActivitySection, 4);
        layoutPanel.Controls.Add(lblLastMessage, 0, 11);
        layoutPanel.Controls.Add(txtLastMessage, 1, 11);
        layoutPanel.SetColumnSpan(txtLastMessage, 3);
        layoutPanel.Controls.Add(lblLastError, 0, 12);
        layoutPanel.Controls.Add(txtLastError, 1, 12);
        layoutPanel.SetColumnSpan(txtLastError, 3);
        //
        // lblClientNameHeader
        //
        lblClientNameHeader.AutoEllipsis = true;
        lblClientNameHeader.Dock = DockStyle.Fill;
        lblClientNameHeader.Font = new Font("Segoe UI Semibold", 13F, FontStyle.Bold);
        lblClientNameHeader.Margin = new Padding(0, 0, 3, 0);
        lblClientNameHeader.Name = "lblClientNameHeader";
        lblClientNameHeader.Size = new Size(300, 30);
        lblClientNameHeader.Text = "Family Prism";
        lblClientNameHeader.TextAlign = ContentAlignment.MiddleLeft;
        //
        // lblConnectionBadge
        //
        lblConnectionBadge.Anchor = AnchorStyles.Right;
        lblConnectionBadge.AutoSize = true;
        lblConnectionBadge.Font = new Font("Segoe UI Semibold", 9.5F, FontStyle.Bold);
        lblConnectionBadge.Margin = new Padding(3, 0, 0, 0);
        lblConnectionBadge.Name = "lblConnectionBadge";
        lblConnectionBadge.Text = "● Not configured";
        //
        // txtStatusMessage
        //
        ConfigureValue(txtStatusMessage, "txtStatusMessage");
        txtStatusMessage.ForeColor = SystemColors.GrayText;
        txtStatusMessage.Margin = new Padding(4, 0, 0, 2);
        //
        // section headers
        //
        ConfigureSection(lblConnectionSection, "lblConnectionSection", "CONNECTION");
        ConfigureSection(lblVersionSection, "lblVersionSection", "VERSION");
        ConfigureSection(lblActivitySection, "lblActivitySection", "ACTIVITY");
        //
        // field labels
        //
        ConfigureLabel(lblServer, "lblServer", "Server");
        ConfigureLabel(lblClientId, "lblClientId", "Client ID");
        ConfigureLabel(lblLastConnected, "lblLastConnected", "Last connected");
        ConfigureLabel(lblSetupComplete, "lblSetupComplete", "Setup");
        ConfigureLabel(lblHostMode, "lblHostMode", "Host");
        ConfigureLabel(lblLastUpdated, "lblLastUpdated", "Status updated");
        ConfigureLabel(lblAgentVersion, "lblAgentVersion", "Version");
        ConfigureLabel(lblLastUpdateCheck, "lblLastUpdateCheck", "Last check");
        ConfigureLabel(lblLastMessage, "lblLastMessage", "Last message");
        ConfigureLabel(lblLastError, "lblLastError", "Last error");
        //
        // field values
        //
        ConfigureValue(txtServer, "txtServer");
        ConfigureValue(txtClientId, "txtClientId");
        ConfigureValue(txtLastConnected, "txtLastConnected");
        ConfigureValue(txtSetupComplete, "txtSetupComplete");
        ConfigureValue(txtHostMode, "txtHostMode");
        ConfigureValue(txtLastUpdated, "txtLastUpdated");
        ConfigureValue(txtAgentVersion, "txtAgentVersion");
        // Center the version row on the button beside it.
        lblAgentVersion.Anchor = AnchorStyles.Left;
        txtAgentVersion.Anchor = AnchorStyles.Left | AnchorStyles.Right;
        ConfigureMultilineValue(txtLastUpdateCheck, "txtLastUpdateCheck", maxLines: 2);
        ConfigureMultilineValue(txtLastMessage, "txtLastMessage", maxLines: 3);
        ConfigureMultilineValue(txtLastError, "txtLastError", maxLines: 3);
        //
        // btnCheckForUpdates
        //
        btnCheckForUpdates.Anchor = AnchorStyles.Right;
        btnCheckForUpdates.AutoSize = true;
        btnCheckForUpdates.AutoSizeMode = AutoSizeMode.GrowAndShrink;
        btnCheckForUpdates.Margin = new Padding(3, 2, 0, 2);
        btnCheckForUpdates.MinimumSize = new Size(130, 0);
        btnCheckForUpdates.Name = "btnCheckForUpdates";
        btnCheckForUpdates.Padding = new Padding(6, 1, 6, 1);
        btnCheckForUpdates.TabIndex = 1;
        btnCheckForUpdates.Text = "Check for updates";
        btnCheckForUpdates.UseVisualStyleBackColor = true;
        btnCheckForUpdates.Click += btnCheckForUpdates_Click;
        //
        // frmAgent
        //
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(560, 400);
        Controls.Add(layoutPanel);
        Font = new Font("Segoe UI", 9F);
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        Name = "frmAgent";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "Family Prism Agent";
        layoutPanel.ResumeLayout(false);
        layoutPanel.PerformLayout();
        ResumeLayout(false);
    }

    private static void ConfigureSection(Label label, string name, string text)
    {
        label.AutoSize = true;
        label.Font = new Font("Segoe UI Semibold", 8F, FontStyle.Bold);
        label.ForeColor = SystemColors.GrayText;
        label.Margin = new Padding(0, 12, 0, 3);
        label.Name = name;
        label.Text = text;
    }

    private static void ConfigureLabel(Label label, string name, string text)
    {
        label.Anchor = AnchorStyles.Left | AnchorStyles.Top;
        label.AutoSize = true;
        label.ForeColor = SystemColors.GrayText;
        label.Margin = new Padding(0, 4, 3, 3);
        label.Name = name;
        label.Text = text;
    }

    /// <summary>A read-only, borderless text box: reads like a label but can be selected and copied.</summary>
    private static void ConfigureValue(TextBox textBox, string name)
    {
        textBox.Anchor = AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Top;
        textBox.BackColor = SystemColors.Control;
        textBox.BorderStyle = BorderStyle.None;
        textBox.Margin = new Padding(3, 4, 3, 3);
        textBox.Name = name;
        textBox.ReadOnly = true;
        textBox.TabStop = false;

        // Borderless text boxes otherwise keep the height of a bordered one, spacing rows unevenly.
        textBox.AutoSize = false;
        textBox.Height = textBox.Font.Height + 2;
    }

    /// <summary>A wrapping value that grows with its text up to <paramref name="maxLines"/> (see frmAgent.FitHeight).</summary>
    private static void ConfigureMultilineValue(TextBox textBox, string name, int maxLines)
    {
        ConfigureValue(textBox, name);
        // A multiline text box draws its text a few pixels further in than a single-line one.
        textBox.Margin = new Padding(0, 4, 3, 3);
        textBox.Multiline = true;
        textBox.WordWrap = true;
        textBox.Tag = maxLines;
    }

    #endregion
}
