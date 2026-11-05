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
    private Label lblLastUpdated;
    private TextBox txtLastUpdated;
    private Label lblHostMode;
    private TextBox txtHostMode;
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
        lblLastUpdated = new Label();
        txtLastUpdated = new TextBox();
        lblHostMode = new Label();
        txtHostMode = new TextBox();
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
        layoutPanel.AutoSize = true;
        layoutPanel.AutoSizeMode = AutoSizeMode.GrowAndShrink;
        layoutPanel.ColumnCount = 4;
        layoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 96F));
        layoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50F));
        layoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 64F));
        layoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50F));
        layoutPanel.Controls.Add(lblClientNameHeader, 0, 0);
        layoutPanel.Controls.Add(lblConnectionBadge, 3, 0);
        layoutPanel.Controls.Add(txtStatusMessage, 0, 1);
        layoutPanel.Controls.Add(lblConnectionSection, 0, 2);
        layoutPanel.Controls.Add(lblServer, 0, 3);
        layoutPanel.Controls.Add(txtServer, 1, 3);
        layoutPanel.Controls.Add(lblClientId, 0, 4);
        layoutPanel.Controls.Add(txtClientId, 1, 4);
        layoutPanel.Controls.Add(lblLastConnected, 0, 5);
        layoutPanel.Controls.Add(txtLastConnected, 1, 5);
        layoutPanel.Controls.Add(lblSetupComplete, 2, 5);
        layoutPanel.Controls.Add(txtSetupComplete, 3, 5);
        layoutPanel.Controls.Add(lblLastUpdated, 0, 6);
        layoutPanel.Controls.Add(txtLastUpdated, 1, 6);
        layoutPanel.Controls.Add(lblHostMode, 2, 6);
        layoutPanel.Controls.Add(txtHostMode, 3, 6);
        layoutPanel.Controls.Add(lblVersionSection, 0, 7);
        layoutPanel.Controls.Add(lblAgentVersion, 0, 8);
        layoutPanel.Controls.Add(txtAgentVersion, 1, 8);
        layoutPanel.Controls.Add(btnCheckForUpdates, 3, 8);
        layoutPanel.Controls.Add(lblLastUpdateCheck, 0, 9);
        layoutPanel.Controls.Add(txtLastUpdateCheck, 1, 9);
        layoutPanel.Controls.Add(lblActivitySection, 0, 10);
        layoutPanel.Controls.Add(lblLastMessage, 0, 11);
        layoutPanel.Controls.Add(txtLastMessage, 1, 11);
        layoutPanel.Controls.Add(lblLastError, 0, 12);
        layoutPanel.Controls.Add(txtLastError, 1, 12);
        layoutPanel.Dock = DockStyle.Top;
        layoutPanel.Location = new Point(0, 0);
        layoutPanel.Name = "layoutPanel";
        layoutPanel.Padding = new Padding(14, 10, 14, 12);
        layoutPanel.RowCount = 13;
        layoutPanel.RowStyles.Add(new RowStyle());
        layoutPanel.RowStyles.Add(new RowStyle());
        layoutPanel.RowStyles.Add(new RowStyle());
        layoutPanel.RowStyles.Add(new RowStyle());
        layoutPanel.RowStyles.Add(new RowStyle());
        layoutPanel.RowStyles.Add(new RowStyle());
        layoutPanel.RowStyles.Add(new RowStyle());
        layoutPanel.RowStyles.Add(new RowStyle());
        layoutPanel.RowStyles.Add(new RowStyle());
        layoutPanel.RowStyles.Add(new RowStyle());
        layoutPanel.RowStyles.Add(new RowStyle());
        layoutPanel.RowStyles.Add(new RowStyle());
        layoutPanel.RowStyles.Add(new RowStyle());
        layoutPanel.SetColumnSpan(lblClientNameHeader, 3);
        layoutPanel.SetColumnSpan(txtStatusMessage, 4);
        layoutPanel.SetColumnSpan(lblConnectionSection, 4);
        layoutPanel.SetColumnSpan(txtServer, 3);
        layoutPanel.SetColumnSpan(txtClientId, 3);
        layoutPanel.SetColumnSpan(lblVersionSection, 4);
        layoutPanel.SetColumnSpan(txtAgentVersion, 2);
        layoutPanel.SetColumnSpan(txtLastUpdateCheck, 3);
        layoutPanel.SetColumnSpan(lblActivitySection, 4);
        layoutPanel.SetColumnSpan(txtLastMessage, 3);
        layoutPanel.SetColumnSpan(txtLastError, 3);
        layoutPanel.Size = new Size(560, 400);
        layoutPanel.TabIndex = 0;
        // 
        // lblClientNameHeader
        // 
        lblClientNameHeader.AutoEllipsis = true;
        lblClientNameHeader.Dock = DockStyle.Fill;
        lblClientNameHeader.Font = new Font("Segoe UI Semibold", 13F, FontStyle.Bold);
        lblClientNameHeader.Margin = new Padding(0, 0, 3, 0);
        lblClientNameHeader.Name = "lblClientNameHeader";
        lblClientNameHeader.Size = new Size(300, 30);
        lblClientNameHeader.TabIndex = 0;
        lblClientNameHeader.Text = "Family Prism";
        lblClientNameHeader.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // lblConnectionBadge
        // 
        lblConnectionBadge.Anchor = AnchorStyles.Right;
        lblConnectionBadge.AutoSize = true;
        lblConnectionBadge.Font = new Font("Segoe UI Semibold", 9.5F, FontStyle.Bold);
        lblConnectionBadge.ForeColor = SystemColors.GrayText;
        lblConnectionBadge.Margin = new Padding(3, 0, 0, 0);
        lblConnectionBadge.Name = "lblConnectionBadge";
        lblConnectionBadge.TabIndex = 1;
        lblConnectionBadge.Text = "\u25CF Not configured";
        // 
        // txtStatusMessage
        // 
        txtStatusMessage.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        txtStatusMessage.AutoSize = false;
        txtStatusMessage.BackColor = SystemColors.Control;
        txtStatusMessage.BorderStyle = BorderStyle.None;
        txtStatusMessage.ForeColor = SystemColors.GrayText;
        txtStatusMessage.Margin = new Padding(4, 0, 0, 2);
        txtStatusMessage.Name = "txtStatusMessage";
        txtStatusMessage.ReadOnly = true;
        txtStatusMessage.Size = new Size(200, 18);
        txtStatusMessage.TabIndex = 2;
        txtStatusMessage.TabStop = false;
        // 
        // lblConnectionSection
        // 
        lblConnectionSection.AutoSize = true;
        lblConnectionSection.Font = new Font("Segoe UI Semibold", 8F, FontStyle.Bold);
        lblConnectionSection.ForeColor = SystemColors.GrayText;
        lblConnectionSection.Margin = new Padding(0, 12, 0, 3);
        lblConnectionSection.Name = "lblConnectionSection";
        lblConnectionSection.TabIndex = 3;
        lblConnectionSection.Text = "CONNECTION";
        // 
        // lblServer
        // 
        lblServer.Anchor = AnchorStyles.Top | AnchorStyles.Left;
        lblServer.AutoSize = true;
        lblServer.ForeColor = SystemColors.GrayText;
        lblServer.Margin = new Padding(0, 4, 3, 3);
        lblServer.Name = "lblServer";
        lblServer.TabIndex = 4;
        lblServer.Text = "Server";
        // 
        // txtServer
        // 
        txtServer.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        txtServer.AutoSize = false;
        txtServer.BackColor = SystemColors.Control;
        txtServer.BorderStyle = BorderStyle.None;
        txtServer.Margin = new Padding(3, 4, 3, 3);
        txtServer.Name = "txtServer";
        txtServer.ReadOnly = true;
        txtServer.Size = new Size(200, 18);
        txtServer.TabIndex = 5;
        txtServer.TabStop = false;
        // 
        // lblClientId
        // 
        lblClientId.Anchor = AnchorStyles.Top | AnchorStyles.Left;
        lblClientId.AutoSize = true;
        lblClientId.ForeColor = SystemColors.GrayText;
        lblClientId.Margin = new Padding(0, 4, 3, 3);
        lblClientId.Name = "lblClientId";
        lblClientId.TabIndex = 6;
        lblClientId.Text = "Client ID";
        // 
        // txtClientId
        // 
        txtClientId.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        txtClientId.AutoSize = false;
        txtClientId.BackColor = SystemColors.Control;
        txtClientId.BorderStyle = BorderStyle.None;
        txtClientId.Margin = new Padding(3, 4, 3, 3);
        txtClientId.Name = "txtClientId";
        txtClientId.ReadOnly = true;
        txtClientId.Size = new Size(200, 18);
        txtClientId.TabIndex = 7;
        txtClientId.TabStop = false;
        // 
        // lblLastConnected
        // 
        lblLastConnected.Anchor = AnchorStyles.Top | AnchorStyles.Left;
        lblLastConnected.AutoSize = true;
        lblLastConnected.ForeColor = SystemColors.GrayText;
        lblLastConnected.Margin = new Padding(0, 4, 3, 3);
        lblLastConnected.Name = "lblLastConnected";
        lblLastConnected.TabIndex = 8;
        lblLastConnected.Text = "Last connected";
        // 
        // txtLastConnected
        // 
        txtLastConnected.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        txtLastConnected.AutoSize = false;
        txtLastConnected.BackColor = SystemColors.Control;
        txtLastConnected.BorderStyle = BorderStyle.None;
        txtLastConnected.Margin = new Padding(3, 4, 3, 3);
        txtLastConnected.Name = "txtLastConnected";
        txtLastConnected.ReadOnly = true;
        txtLastConnected.Size = new Size(200, 18);
        txtLastConnected.TabIndex = 9;
        txtLastConnected.TabStop = false;
        // 
        // lblSetupComplete
        // 
        lblSetupComplete.Anchor = AnchorStyles.Top | AnchorStyles.Left;
        lblSetupComplete.AutoSize = true;
        lblSetupComplete.ForeColor = SystemColors.GrayText;
        lblSetupComplete.Margin = new Padding(0, 4, 3, 3);
        lblSetupComplete.Name = "lblSetupComplete";
        lblSetupComplete.TabIndex = 10;
        lblSetupComplete.Text = "Setup";
        // 
        // txtSetupComplete
        // 
        txtSetupComplete.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        txtSetupComplete.AutoSize = false;
        txtSetupComplete.BackColor = SystemColors.Control;
        txtSetupComplete.BorderStyle = BorderStyle.None;
        txtSetupComplete.Margin = new Padding(3, 4, 3, 3);
        txtSetupComplete.Name = "txtSetupComplete";
        txtSetupComplete.ReadOnly = true;
        txtSetupComplete.Size = new Size(200, 18);
        txtSetupComplete.TabIndex = 11;
        txtSetupComplete.TabStop = false;
        // 
        // lblLastUpdated
        // 
        lblLastUpdated.Anchor = AnchorStyles.Top | AnchorStyles.Left;
        lblLastUpdated.AutoSize = true;
        lblLastUpdated.ForeColor = SystemColors.GrayText;
        lblLastUpdated.Margin = new Padding(0, 4, 3, 3);
        lblLastUpdated.Name = "lblLastUpdated";
        lblLastUpdated.TabIndex = 12;
        lblLastUpdated.Text = "Status updated";
        // 
        // txtLastUpdated
        // 
        txtLastUpdated.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        txtLastUpdated.AutoSize = false;
        txtLastUpdated.BackColor = SystemColors.Control;
        txtLastUpdated.BorderStyle = BorderStyle.None;
        txtLastUpdated.Margin = new Padding(3, 4, 3, 3);
        txtLastUpdated.Name = "txtLastUpdated";
        txtLastUpdated.ReadOnly = true;
        txtLastUpdated.Size = new Size(200, 18);
        txtLastUpdated.TabIndex = 13;
        txtLastUpdated.TabStop = false;
        // 
        // lblHostMode
        // 
        lblHostMode.Anchor = AnchorStyles.Top | AnchorStyles.Left;
        lblHostMode.AutoSize = true;
        lblHostMode.ForeColor = SystemColors.GrayText;
        lblHostMode.Margin = new Padding(0, 4, 3, 3);
        lblHostMode.Name = "lblHostMode";
        lblHostMode.TabIndex = 14;
        lblHostMode.Text = "Host";
        // 
        // txtHostMode
        // 
        txtHostMode.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        txtHostMode.AutoSize = false;
        txtHostMode.BackColor = SystemColors.Control;
        txtHostMode.BorderStyle = BorderStyle.None;
        txtHostMode.Margin = new Padding(3, 4, 3, 3);
        txtHostMode.Name = "txtHostMode";
        txtHostMode.ReadOnly = true;
        txtHostMode.Size = new Size(200, 18);
        txtHostMode.TabIndex = 15;
        txtHostMode.TabStop = false;
        // 
        // lblVersionSection
        // 
        lblVersionSection.AutoSize = true;
        lblVersionSection.Font = new Font("Segoe UI Semibold", 8F, FontStyle.Bold);
        lblVersionSection.ForeColor = SystemColors.GrayText;
        lblVersionSection.Margin = new Padding(0, 12, 0, 3);
        lblVersionSection.Name = "lblVersionSection";
        lblVersionSection.TabIndex = 16;
        lblVersionSection.Text = "VERSION";
        // 
        // lblAgentVersion
        // 
        lblAgentVersion.Anchor = AnchorStyles.Left;
        lblAgentVersion.AutoSize = true;
        lblAgentVersion.ForeColor = SystemColors.GrayText;
        lblAgentVersion.Margin = new Padding(0, 4, 3, 3);
        lblAgentVersion.Name = "lblAgentVersion";
        lblAgentVersion.TabIndex = 17;
        lblAgentVersion.Text = "Version";
        // 
        // txtAgentVersion
        // 
        txtAgentVersion.Anchor = AnchorStyles.Left | AnchorStyles.Right;
        txtAgentVersion.AutoSize = false;
        txtAgentVersion.BackColor = SystemColors.Control;
        txtAgentVersion.BorderStyle = BorderStyle.None;
        txtAgentVersion.Margin = new Padding(3, 4, 3, 3);
        txtAgentVersion.Name = "txtAgentVersion";
        txtAgentVersion.ReadOnly = true;
        txtAgentVersion.Size = new Size(200, 18);
        txtAgentVersion.TabIndex = 18;
        txtAgentVersion.TabStop = false;
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
        btnCheckForUpdates.TabIndex = 19;
        btnCheckForUpdates.Text = "Check for updates";
        btnCheckForUpdates.UseVisualStyleBackColor = true;
        btnCheckForUpdates.Click += btnCheckForUpdates_Click;
        // 
        // lblLastUpdateCheck
        // 
        lblLastUpdateCheck.Anchor = AnchorStyles.Top | AnchorStyles.Left;
        lblLastUpdateCheck.AutoSize = true;
        lblLastUpdateCheck.ForeColor = SystemColors.GrayText;
        lblLastUpdateCheck.Margin = new Padding(0, 4, 3, 3);
        lblLastUpdateCheck.Name = "lblLastUpdateCheck";
        lblLastUpdateCheck.TabIndex = 20;
        lblLastUpdateCheck.Text = "Last check";
        // 
        // txtLastUpdateCheck
        // 
        txtLastUpdateCheck.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        txtLastUpdateCheck.AutoSize = false;
        txtLastUpdateCheck.BackColor = SystemColors.Control;
        txtLastUpdateCheck.BorderStyle = BorderStyle.None;
        txtLastUpdateCheck.Margin = new Padding(0, 4, 3, 3);
        txtLastUpdateCheck.Multiline = true;
        txtLastUpdateCheck.Name = "txtLastUpdateCheck";
        txtLastUpdateCheck.ReadOnly = true;
        txtLastUpdateCheck.Size = new Size(200, 18);
        txtLastUpdateCheck.TabIndex = 21;
        txtLastUpdateCheck.TabStop = false;
        // 
        // lblActivitySection
        // 
        lblActivitySection.AutoSize = true;
        lblActivitySection.Font = new Font("Segoe UI Semibold", 8F, FontStyle.Bold);
        lblActivitySection.ForeColor = SystemColors.GrayText;
        lblActivitySection.Margin = new Padding(0, 12, 0, 3);
        lblActivitySection.Name = "lblActivitySection";
        lblActivitySection.TabIndex = 22;
        lblActivitySection.Text = "ACTIVITY";
        // 
        // lblLastMessage
        // 
        lblLastMessage.Anchor = AnchorStyles.Top | AnchorStyles.Left;
        lblLastMessage.AutoSize = true;
        lblLastMessage.ForeColor = SystemColors.GrayText;
        lblLastMessage.Margin = new Padding(0, 4, 3, 3);
        lblLastMessage.Name = "lblLastMessage";
        lblLastMessage.TabIndex = 23;
        lblLastMessage.Text = "Last message";
        // 
        // txtLastMessage
        // 
        txtLastMessage.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        txtLastMessage.AutoSize = false;
        txtLastMessage.BackColor = SystemColors.Control;
        txtLastMessage.BorderStyle = BorderStyle.None;
        txtLastMessage.Margin = new Padding(0, 4, 3, 3);
        txtLastMessage.Multiline = true;
        txtLastMessage.Name = "txtLastMessage";
        txtLastMessage.ReadOnly = true;
        txtLastMessage.Size = new Size(200, 18);
        txtLastMessage.TabIndex = 24;
        txtLastMessage.TabStop = false;
        // 
        // lblLastError
        // 
        lblLastError.Anchor = AnchorStyles.Top | AnchorStyles.Left;
        lblLastError.AutoSize = true;
        lblLastError.ForeColor = SystemColors.GrayText;
        lblLastError.Margin = new Padding(0, 4, 3, 3);
        lblLastError.Name = "lblLastError";
        lblLastError.TabIndex = 25;
        lblLastError.Text = "Last error";
        // 
        // txtLastError
        // 
        txtLastError.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        txtLastError.AutoSize = false;
        txtLastError.BackColor = SystemColors.Control;
        txtLastError.BorderStyle = BorderStyle.None;
        txtLastError.Margin = new Padding(0, 4, 3, 3);
        txtLastError.Multiline = true;
        txtLastError.Name = "txtLastError";
        txtLastError.ReadOnly = true;
        txtLastError.Size = new Size(200, 18);
        txtLastError.TabIndex = 26;
        txtLastError.TabStop = false;
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
        PerformLayout();
    }

    #endregion
}
