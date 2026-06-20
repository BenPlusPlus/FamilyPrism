namespace prismagent;

partial class frmAgent
{
    private System.ComponentModel.IContainer components = null;
    private TableLayoutPanel layoutPanel;
    private Label lblSetupComplete;
    private Label lblHostMode;
    private Label lblConnectionState;
    private Label lblStatusMessage;
    private Label lblServer;
    private Label lblClientName;
    private Label lblClientId;
    private Label lblLastConnected;
    private Label lblLastMessage;
    private Label lblLastError;
    private Label lblLastUpdated;
    private TextBox txtSetupComplete;
    private TextBox txtHostMode;
    private TextBox txtConnectionState;
    private TextBox txtStatusMessage;
    private TextBox txtServer;
    private TextBox txtClientName;
    private TextBox txtClientId;
    private TextBox txtLastConnected;
    private TextBox txtLastMessage;
    private TextBox txtLastError;
    private TextBox txtLastUpdated;

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
        layoutPanel = new TableLayoutPanel();
        lblSetupComplete = new Label();
        txtSetupComplete = new TextBox();
        lblHostMode = new Label();
        txtHostMode = new TextBox();
        lblConnectionState = new Label();
        txtConnectionState = new TextBox();
        lblStatusMessage = new Label();
        txtStatusMessage = new TextBox();
        lblServer = new Label();
        txtServer = new TextBox();
        lblClientName = new Label();
        txtClientName = new TextBox();
        lblClientId = new Label();
        txtClientId = new TextBox();
        lblLastConnected = new Label();
        txtLastConnected = new TextBox();
        lblLastMessage = new Label();
        txtLastMessage = new TextBox();
        lblLastError = new Label();
        txtLastError = new TextBox();
        lblLastUpdated = new Label();
        txtLastUpdated = new TextBox();
        layoutPanel.SuspendLayout();
        SuspendLayout();
        // 
        // layoutPanel
        // 
        layoutPanel.ColumnCount = 2;
        layoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 150F));
        layoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        layoutPanel.Controls.Add(lblSetupComplete, 0, 0);
        layoutPanel.Controls.Add(txtSetupComplete, 1, 0);
        layoutPanel.Controls.Add(lblHostMode, 0, 1);
        layoutPanel.Controls.Add(txtHostMode, 1, 1);
        layoutPanel.Controls.Add(lblConnectionState, 0, 2);
        layoutPanel.Controls.Add(txtConnectionState, 1, 2);
        layoutPanel.Controls.Add(lblStatusMessage, 0, 3);
        layoutPanel.Controls.Add(txtStatusMessage, 1, 3);
        layoutPanel.Controls.Add(lblServer, 0, 4);
        layoutPanel.Controls.Add(txtServer, 1, 4);
        layoutPanel.Controls.Add(lblClientName, 0, 5);
        layoutPanel.Controls.Add(txtClientName, 1, 5);
        layoutPanel.Controls.Add(lblClientId, 0, 6);
        layoutPanel.Controls.Add(txtClientId, 1, 6);
        layoutPanel.Controls.Add(lblLastConnected, 0, 7);
        layoutPanel.Controls.Add(txtLastConnected, 1, 7);
        layoutPanel.Controls.Add(lblLastMessage, 0, 8);
        layoutPanel.Controls.Add(txtLastMessage, 1, 8);
        layoutPanel.Controls.Add(lblLastError, 0, 9);
        layoutPanel.Controls.Add(txtLastError, 1, 9);
        layoutPanel.Controls.Add(lblLastUpdated, 0, 10);
        layoutPanel.Controls.Add(txtLastUpdated, 1, 10);
        layoutPanel.Dock = DockStyle.Fill;
        layoutPanel.Location = new Point(0, 0);
        layoutPanel.Name = "layoutPanel";
        layoutPanel.Padding = new Padding(12);
        layoutPanel.RowCount = 11;
        layoutPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 32F));
        layoutPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 32F));
        layoutPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 32F));
        layoutPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 70F));
        layoutPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 32F));
        layoutPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 33F));
        layoutPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 31F));
        layoutPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 32F));
        layoutPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 90F));
        layoutPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 90F));
        layoutPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 32F));
        layoutPanel.Size = new Size(760, 560);
        layoutPanel.TabIndex = 0;
        // 
        // lblSetupComplete
        // 
        lblSetupComplete.Anchor = AnchorStyles.Left;
        lblSetupComplete.AutoSize = true;
        lblSetupComplete.Location = new Point(15, 20);
        lblSetupComplete.Name = "lblSetupComplete";
        lblSetupComplete.Size = new Size(90, 15);
        lblSetupComplete.TabIndex = 0;
        lblSetupComplete.Text = "Setup complete";
        // 
        // txtSetupComplete
        // 
        txtSetupComplete.BackColor = SystemColors.Window;
        txtSetupComplete.BorderStyle = BorderStyle.FixedSingle;
        txtSetupComplete.Dock = DockStyle.Fill;
        txtSetupComplete.Location = new Point(165, 15);
        txtSetupComplete.Name = "txtSetupComplete";
        txtSetupComplete.ReadOnly = true;
        txtSetupComplete.Size = new Size(580, 23);
        txtSetupComplete.TabIndex = 1;
        // 
        // lblHostMode
        // 
        lblHostMode.Anchor = AnchorStyles.Left;
        lblHostMode.AutoSize = true;
        lblHostMode.Location = new Point(15, 52);
        lblHostMode.Name = "lblHostMode";
        lblHostMode.Size = new Size(66, 15);
        lblHostMode.TabIndex = 2;
        lblHostMode.Text = "Host mode";
        // 
        // txtHostMode
        // 
        txtHostMode.BackColor = SystemColors.Window;
        txtHostMode.BorderStyle = BorderStyle.FixedSingle;
        txtHostMode.Dock = DockStyle.Fill;
        txtHostMode.Location = new Point(165, 47);
        txtHostMode.Name = "txtHostMode";
        txtHostMode.ReadOnly = true;
        txtHostMode.Size = new Size(580, 23);
        txtHostMode.TabIndex = 3;
        // 
        // lblConnectionState
        // 
        lblConnectionState.Anchor = AnchorStyles.Left;
        lblConnectionState.AutoSize = true;
        lblConnectionState.Location = new Point(15, 84);
        lblConnectionState.Name = "lblConnectionState";
        lblConnectionState.Size = new Size(97, 15);
        lblConnectionState.TabIndex = 4;
        lblConnectionState.Text = "Connection state";
        // 
        // txtConnectionState
        // 
        txtConnectionState.BackColor = SystemColors.Window;
        txtConnectionState.BorderStyle = BorderStyle.FixedSingle;
        txtConnectionState.Dock = DockStyle.Fill;
        txtConnectionState.Location = new Point(165, 79);
        txtConnectionState.Name = "txtConnectionState";
        txtConnectionState.ReadOnly = true;
        txtConnectionState.Size = new Size(580, 23);
        txtConnectionState.TabIndex = 5;
        // 
        // lblStatusMessage
        // 
        lblStatusMessage.Anchor = AnchorStyles.Left;
        lblStatusMessage.AutoSize = true;
        lblStatusMessage.Location = new Point(15, 135);
        lblStatusMessage.Name = "lblStatusMessage";
        lblStatusMessage.Size = new Size(88, 15);
        lblStatusMessage.TabIndex = 6;
        lblStatusMessage.Text = "Status message";
        // 
        // txtStatusMessage
        // 
        txtStatusMessage.BackColor = SystemColors.Window;
        txtStatusMessage.BorderStyle = BorderStyle.FixedSingle;
        txtStatusMessage.Dock = DockStyle.Fill;
        txtStatusMessage.Location = new Point(165, 111);
        txtStatusMessage.Multiline = true;
        txtStatusMessage.Name = "txtStatusMessage";
        txtStatusMessage.ReadOnly = true;
        txtStatusMessage.ScrollBars = ScrollBars.Vertical;
        txtStatusMessage.Size = new Size(580, 64);
        txtStatusMessage.TabIndex = 7;
        // 
        // lblServer
        // 
        lblServer.Anchor = AnchorStyles.Left;
        lblServer.AutoSize = true;
        lblServer.Location = new Point(15, 186);
        lblServer.Name = "lblServer";
        lblServer.Size = new Size(39, 15);
        lblServer.TabIndex = 8;
        lblServer.Text = "Server";
        // 
        // txtServer
        // 
        txtServer.BackColor = SystemColors.Window;
        txtServer.BorderStyle = BorderStyle.FixedSingle;
        txtServer.Dock = DockStyle.Fill;
        txtServer.Location = new Point(165, 181);
        txtServer.Name = "txtServer";
        txtServer.ReadOnly = true;
        txtServer.Size = new Size(580, 23);
        txtServer.TabIndex = 9;
        // 
        // lblClientName
        // 
        lblClientName.Anchor = AnchorStyles.Left;
        lblClientName.AutoSize = true;
        lblClientName.Location = new Point(15, 219);
        lblClientName.Name = "lblClientName";
        lblClientName.Size = new Size(71, 15);
        lblClientName.TabIndex = 10;
        lblClientName.Text = "Client name";
        // 
        // txtClientName
        // 
        txtClientName.BackColor = SystemColors.Window;
        txtClientName.BorderStyle = BorderStyle.FixedSingle;
        txtClientName.Dock = DockStyle.Fill;
        txtClientName.Location = new Point(165, 213);
        txtClientName.Name = "txtClientName";
        txtClientName.ReadOnly = true;
        txtClientName.Size = new Size(580, 23);
        txtClientName.TabIndex = 11;
        // 
        // lblClientId
        // 
        lblClientId.Anchor = AnchorStyles.Left;
        lblClientId.AutoSize = true;
        lblClientId.Location = new Point(15, 251);
        lblClientId.Name = "lblClientId";
        lblClientId.Size = new Size(52, 15);
        lblClientId.TabIndex = 12;
        lblClientId.Text = "Client ID";
        // 
        // txtClientId
        // 
        txtClientId.BackColor = SystemColors.Window;
        txtClientId.BorderStyle = BorderStyle.FixedSingle;
        txtClientId.Dock = DockStyle.Fill;
        txtClientId.Location = new Point(165, 246);
        txtClientId.Name = "txtClientId";
        txtClientId.ReadOnly = true;
        txtClientId.Size = new Size(580, 23);
        txtClientId.TabIndex = 13;
        // 
        // lblLastConnected
        // 
        lblLastConnected.Anchor = AnchorStyles.Left;
        lblLastConnected.AutoSize = true;
        lblLastConnected.Location = new Point(15, 282);
        lblLastConnected.Name = "lblLastConnected";
        lblLastConnected.Size = new Size(87, 15);
        lblLastConnected.TabIndex = 14;
        lblLastConnected.Text = "Last connected";
        // 
        // txtLastConnected
        // 
        txtLastConnected.BackColor = SystemColors.Window;
        txtLastConnected.BorderStyle = BorderStyle.FixedSingle;
        txtLastConnected.Dock = DockStyle.Fill;
        txtLastConnected.Location = new Point(165, 277);
        txtLastConnected.Name = "txtLastConnected";
        txtLastConnected.ReadOnly = true;
        txtLastConnected.Size = new Size(580, 23);
        txtLastConnected.TabIndex = 15;
        // 
        // lblLastMessage
        // 
        lblLastMessage.Anchor = AnchorStyles.Left;
        lblLastMessage.AutoSize = true;
        lblLastMessage.Location = new Point(15, 343);
        lblLastMessage.Name = "lblLastMessage";
        lblLastMessage.Size = new Size(77, 15);
        lblLastMessage.TabIndex = 16;
        lblLastMessage.Text = "Last message";
        // 
        // txtLastMessage
        // 
        txtLastMessage.BackColor = SystemColors.Window;
        txtLastMessage.BorderStyle = BorderStyle.FixedSingle;
        txtLastMessage.Dock = DockStyle.Fill;
        txtLastMessage.Location = new Point(165, 309);
        txtLastMessage.Multiline = true;
        txtLastMessage.Name = "txtLastMessage";
        txtLastMessage.ReadOnly = true;
        txtLastMessage.ScrollBars = ScrollBars.Vertical;
        txtLastMessage.Size = new Size(580, 84);
        txtLastMessage.TabIndex = 17;
        // 
        // lblLastError
        // 
        lblLastError.Anchor = AnchorStyles.Left;
        lblLastError.AutoSize = true;
        lblLastError.Location = new Point(15, 433);
        lblLastError.Name = "lblLastError";
        lblLastError.Size = new Size(56, 15);
        lblLastError.TabIndex = 18;
        lblLastError.Text = "Last error";
        // 
        // txtLastError
        // 
        txtLastError.BackColor = SystemColors.Window;
        txtLastError.BorderStyle = BorderStyle.FixedSingle;
        txtLastError.Dock = DockStyle.Fill;
        txtLastError.Location = new Point(165, 399);
        txtLastError.Multiline = true;
        txtLastError.Name = "txtLastError";
        txtLastError.ReadOnly = true;
        txtLastError.ScrollBars = ScrollBars.Vertical;
        txtLastError.Size = new Size(580, 84);
        txtLastError.TabIndex = 19;
        // 
        // lblLastUpdated
        // 
        lblLastUpdated.Anchor = AnchorStyles.Left;
        lblLastUpdated.AutoSize = true;
        lblLastUpdated.Location = new Point(15, 509);
        lblLastUpdated.Name = "lblLastUpdated";
        lblLastUpdated.Size = new Size(75, 15);
        lblLastUpdated.TabIndex = 20;
        lblLastUpdated.Text = "Last updated";
        // 
        // txtLastUpdated
        // 
        txtLastUpdated.BackColor = SystemColors.Window;
        txtLastUpdated.BorderStyle = BorderStyle.FixedSingle;
        txtLastUpdated.Dock = DockStyle.Fill;
        txtLastUpdated.Location = new Point(165, 489);
        txtLastUpdated.Name = "txtLastUpdated";
        txtLastUpdated.ReadOnly = true;
        txtLastUpdated.Size = new Size(580, 23);
        txtLastUpdated.TabIndex = 21;
        // 
        // frmAgent
        // 
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(760, 560);
        Controls.Add(layoutPanel);
        MinimumSize = new Size(760, 560);
        Name = "frmAgent";
        Text = "Family Prism Agent";
        layoutPanel.ResumeLayout(false);
        layoutPanel.PerformLayout();
        ResumeLayout(false);
    }

    #endregion
}
