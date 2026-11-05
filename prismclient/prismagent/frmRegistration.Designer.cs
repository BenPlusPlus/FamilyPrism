namespace prismagent;

partial class frmRegistration
{
    private System.ComponentModel.IContainer components = null;
    private TableLayoutPanel layoutPanel;
    private Label lblServerName;
    private Label lblDeviceName;
    private Label lblRegistrationCode;
    private TextBox txtServerName;
    private TextBox txtDeviceName;
    private TextBox txtRegistrationCode;
    private Label lblStatus;
    private FlowLayoutPanel buttonPanel;
    private Button btnCancel;
    private Button btnRegister;

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
        lblServerName = new Label();
        txtServerName = new TextBox();
        lblDeviceName = new Label();
        txtDeviceName = new TextBox();
        lblRegistrationCode = new Label();
        txtRegistrationCode = new TextBox();
        lblStatus = new Label();
        buttonPanel = new FlowLayoutPanel();
        btnCancel = new Button();
        btnRegister = new Button();
        layoutPanel.SuspendLayout();
        buttonPanel.SuspendLayout();
        SuspendLayout();
        // 
        // layoutPanel
        // 
        layoutPanel.ColumnCount = 2;
        layoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 150F));
        layoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        layoutPanel.Controls.Add(lblServerName, 0, 0);
        layoutPanel.Controls.Add(txtServerName, 1, 0);
        layoutPanel.Controls.Add(lblDeviceName, 0, 1);
        layoutPanel.Controls.Add(txtDeviceName, 1, 1);
        layoutPanel.Controls.Add(lblRegistrationCode, 0, 2);
        layoutPanel.Controls.Add(txtRegistrationCode, 1, 2);
        layoutPanel.Controls.Add(lblStatus, 1, 3);
        layoutPanel.Controls.Add(buttonPanel, 1, 4);
        layoutPanel.Dock = DockStyle.Fill;
        layoutPanel.Location = new Point(0, 0);
        layoutPanel.Name = "layoutPanel";
        layoutPanel.Padding = new Padding(12);
        layoutPanel.RowCount = 5;
        layoutPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 34F));
        layoutPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 34F));
        layoutPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 34F));
        layoutPanel.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
        layoutPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 42F));
        layoutPanel.Size = new Size(520, 250);
        layoutPanel.TabIndex = 0;
        // 
        // lblServerName
        // 
        lblServerName.Anchor = AnchorStyles.Left;
        lblServerName.AutoSize = true;
        lblServerName.Location = new Point(15, 21);
        lblServerName.Name = "lblServerName";
        lblServerName.Size = new Size(110, 15);
        lblServerName.TabIndex = 0;
        lblServerName.Text = "Server name or URL";
        // 
        // txtServerName
        // 
        txtServerName.Dock = DockStyle.Fill;
        txtServerName.Location = new Point(165, 15);
        txtServerName.Name = "txtServerName";
        txtServerName.Size = new Size(340, 23);
        txtServerName.TabIndex = 1;
        // 
        // lblDeviceName
        // 
        lblDeviceName.Anchor = AnchorStyles.Left;
        lblDeviceName.AutoSize = true;
        lblDeviceName.Location = new Point(15, 55);
        lblDeviceName.Name = "lblDeviceName";
        lblDeviceName.Size = new Size(75, 15);
        lblDeviceName.TabIndex = 2;
        lblDeviceName.Text = "Device name";
        // 
        // txtDeviceName
        // 
        txtDeviceName.Dock = DockStyle.Fill;
        txtDeviceName.Location = new Point(165, 49);
        txtDeviceName.Name = "txtDeviceName";
        txtDeviceName.Size = new Size(340, 23);
        txtDeviceName.TabIndex = 3;
        // 
        // lblRegistrationCode
        // 
        lblRegistrationCode.Anchor = AnchorStyles.Left;
        lblRegistrationCode.AutoSize = true;
        lblRegistrationCode.Location = new Point(15, 89);
        lblRegistrationCode.Name = "lblRegistrationCode";
        lblRegistrationCode.Size = new Size(99, 15);
        lblRegistrationCode.TabIndex = 4;
        lblRegistrationCode.Text = "Registration code";
        // 
        // txtRegistrationCode
        // 
        txtRegistrationCode.Dock = DockStyle.Fill;
        txtRegistrationCode.Location = new Point(165, 83);
        txtRegistrationCode.Name = "txtRegistrationCode";
        txtRegistrationCode.Size = new Size(340, 23);
        txtRegistrationCode.TabIndex = 5;
        txtRegistrationCode.UseSystemPasswordChar = true;
        // 
        // lblStatus
        // 
        lblStatus.AutoSize = true;
        lblStatus.ForeColor = Color.Firebrick;
        lblStatus.Location = new Point(165, 114);
        lblStatus.Name = "lblStatus";
        lblStatus.Size = new Size(0, 15);
        lblStatus.TabIndex = 6;
        // 
        // buttonPanel
        // 
        buttonPanel.Controls.Add(btnCancel);
        buttonPanel.Controls.Add(btnRegister);
        buttonPanel.Dock = DockStyle.Fill;
        buttonPanel.FlowDirection = FlowDirection.RightToLeft;
        buttonPanel.Location = new Point(165, 199);
        buttonPanel.Name = "buttonPanel";
        buttonPanel.Size = new Size(340, 36);
        buttonPanel.TabIndex = 7;
        // 
        // btnCancel
        // 
        btnCancel.AutoSize = true;
        btnCancel.Location = new Point(262, 3);
        btnCancel.Name = "btnCancel";
        btnCancel.Size = new Size(75, 25);
        btnCancel.TabIndex = 1;
        btnCancel.Text = "Cancel";
        btnCancel.UseVisualStyleBackColor = true;
        btnCancel.Click += btnCancel_Click;
        // 
        // btnRegister
        // 
        btnRegister.AutoSize = true;
        btnRegister.Location = new Point(181, 3);
        btnRegister.Name = "btnRegister";
        btnRegister.Size = new Size(75, 25);
        btnRegister.TabIndex = 0;
        btnRegister.Text = "Register";
        btnRegister.UseVisualStyleBackColor = true;
        btnRegister.Click += btnRegister_Click;
        // 
        // frmRegistration
        // 
        AcceptButton = btnRegister;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        CancelButton = btnCancel;
        ClientSize = new Size(520, 250);
        Controls.Add(layoutPanel);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "frmRegistration";
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.CenterParent;
        Text = "Family Prism Setup";
        layoutPanel.ResumeLayout(false);
        layoutPanel.PerformLayout();
        buttonPanel.ResumeLayout(false);
        buttonPanel.PerformLayout();
        ResumeLayout(false);
    }

    #endregion
}
