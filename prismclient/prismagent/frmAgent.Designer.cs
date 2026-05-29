namespace prismagent;

partial class frmAgent
{
    private System.ComponentModel.IContainer components = null;
    private TableLayoutPanel layoutPanel;
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
        txtSetupComplete = new TextBox();
        txtHostMode = new TextBox();
        txtConnectionState = new TextBox();
        txtStatusMessage = new TextBox();
        txtServer = new TextBox();
        txtClientName = new TextBox();
        txtClientId = new TextBox();
        txtLastConnected = new TextBox();
        txtLastMessage = new TextBox();
        txtLastError = new TextBox();
        txtLastUpdated = new TextBox();
        SuspendLayout();
        // 
        // layoutPanel
        // 
        layoutPanel.ColumnCount = 2;
        layoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 150F));
        layoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
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
        // txtSetupComplete
        // 
        txtSetupComplete.Location = new Point(0, 0);
        txtSetupComplete.Name = "txtSetupComplete";
        txtSetupComplete.Size = new Size(100, 23);
        txtSetupComplete.TabIndex = 0;
        // 
        // txtHostMode
        // 
        txtHostMode.Location = new Point(0, 0);
        txtHostMode.Name = "txtHostMode";
        txtHostMode.Size = new Size(100, 23);
        txtHostMode.TabIndex = 0;
        // 
        // txtConnectionState
        // 
        txtConnectionState.Location = new Point(0, 0);
        txtConnectionState.Name = "txtConnectionState";
        txtConnectionState.Size = new Size(100, 23);
        txtConnectionState.TabIndex = 0;
        // 
        // txtStatusMessage
        // 
        txtStatusMessage.Location = new Point(0, 0);
        txtStatusMessage.Name = "txtStatusMessage";
        txtStatusMessage.Size = new Size(100, 23);
        txtStatusMessage.TabIndex = 0;
        // 
        // txtServer
        // 
        txtServer.Location = new Point(0, 0);
        txtServer.Name = "txtServer";
        txtServer.Size = new Size(100, 23);
        txtServer.TabIndex = 0;
        // 
        // txtClientName
        // 
        txtClientName.Location = new Point(0, 0);
        txtClientName.Name = "txtClientName";
        txtClientName.Size = new Size(100, 23);
        txtClientName.TabIndex = 0;
        // 
        // txtClientId
        // 
        txtClientId.Location = new Point(0, 0);
        txtClientId.Name = "txtClientId";
        txtClientId.Size = new Size(100, 23);
        txtClientId.TabIndex = 0;
        // 
        // txtLastConnected
        // 
        txtLastConnected.Location = new Point(0, 0);
        txtLastConnected.Name = "txtLastConnected";
        txtLastConnected.Size = new Size(100, 23);
        txtLastConnected.TabIndex = 0;
        // 
        // txtLastMessage
        // 
        txtLastMessage.Location = new Point(0, 0);
        txtLastMessage.Name = "txtLastMessage";
        txtLastMessage.Size = new Size(100, 23);
        txtLastMessage.TabIndex = 0;
        // 
        // txtLastError
        // 
        txtLastError.Location = new Point(0, 0);
        txtLastError.Name = "txtLastError";
        txtLastError.Size = new Size(100, 23);
        txtLastError.TabIndex = 0;
        // 
        // txtLastUpdated
        // 
        txtLastUpdated.Location = new Point(0, 0);
        txtLastUpdated.Name = "txtLastUpdated";
        txtLastUpdated.Size = new Size(100, 23);
        txtLastUpdated.TabIndex = 0;
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
        ResumeLayout(false);
    }

    private void AddRow(int rowIndex, string labelText, Control valueControl)
    {
        var label = new Label
        {
            AutoSize = true,
            Anchor = AnchorStyles.Left,
            Text = labelText
        };

        valueControl.Dock = DockStyle.Fill;
        layoutPanel.Controls.Add(label, 0, rowIndex);
        layoutPanel.Controls.Add(valueControl, 1, rowIndex);
    }

    private static void ConfigureReadOnlyTextBox(TextBox textBox, bool multiline = false)
    {
        textBox.ReadOnly = true;
        textBox.Multiline = multiline;
        textBox.ScrollBars = multiline ? ScrollBars.Vertical : ScrollBars.None;
        textBox.BorderStyle = BorderStyle.FixedSingle;
        textBox.BackColor = SystemColors.Window;
    }

    #endregion
}
