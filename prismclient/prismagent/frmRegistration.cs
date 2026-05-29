using System.ComponentModel;
using prismshared;

namespace prismagent;

public sealed class frmRegistration : Form
{
    private readonly PrismApiClient apiClient = new();
    private readonly TextBox txtServerName = new();
    private readonly TextBox txtDeviceName = new();
    private readonly TextBox txtRegistrationCode = new();
    private readonly Button btnRegister = new();
    private readonly Button btnCancel = new();
    private readonly Label lblStatus = new();

    public frmRegistration(PrismStatusSnapshot currentStatus)
    {
        Text = "Family Prism Setup";
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MinimizeBox = false;
        MaximizeBox = false;
        ShowInTaskbar = false;
        ClientSize = new Size(520, 250);

        txtServerName.Text = currentStatus.ServerBaseUrl ?? string.Empty;
        txtDeviceName.Text = currentStatus.ClientName ?? Environment.MachineName;
        txtRegistrationCode.UseSystemPasswordChar = true;

        btnRegister.Text = "Register";
        btnRegister.AutoSize = true;
        btnRegister.Click += btnRegister_Click;

        btnCancel.Text = "Cancel";
        btnCancel.AutoSize = true;
        btnCancel.Click += (_, _) => Close();

        lblStatus.AutoSize = true;
        lblStatus.ForeColor = Color.Firebrick;

        AcceptButton = btnRegister;
        CancelButton = btnCancel;

        var layout = BuildLayout();
        Controls.Add(layout);
    }

    private Control BuildLayout()
    {
        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(12),
            ColumnCount = 2,
            RowCount = 5
        };

        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 150F));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 34F));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 34F));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 34F));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 42F));

        AddRow(layout, 0, "Server name or URL", txtServerName);
        AddRow(layout, 1, "Device name", txtDeviceName);
        AddRow(layout, 2, "Registration code", txtRegistrationCode);
        layout.Controls.Add(lblStatus, 1, 3);

        var buttonPanel = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.RightToLeft
        };
        buttonPanel.Controls.Add(btnCancel);
        buttonPanel.Controls.Add(btnRegister);

        layout.Controls.Add(buttonPanel, 1, 4);
        return layout;
    }

    private static void AddRow(TableLayoutPanel layout, int rowIndex, string labelText, Control control)
    {
        var label = new Label
        {
            AutoSize = true,
            Anchor = AnchorStyles.Left,
            Text = labelText
        };

        control.Dock = DockStyle.Fill;
        layout.Controls.Add(label, 0, rowIndex);
        layout.Controls.Add(control, 1, rowIndex);
    }

    private async void btnRegister_Click(object? sender, EventArgs e)
    {
        try
        {
            ToggleBusy(true, "Registering with the server...");

            var registration = await apiClient.RegisterAsync(
                txtServerName.Text,
                txtDeviceName.Text,
                txtRegistrationCode.Text,
                CancellationToken.None);

            var pendingSetupPath = PendingSetupStore.Write(new PendingSetupPayload(
                registration.ServerBaseUrl,
                registration.Registration.ClientId,
                registration.Registration.ClientName,
                registration.Registration.Credential,
                registration.Registration.WebsocketPath));

            try
            {
                var exitCode = await SetupCompletionLauncher.RunAsync(pendingSetupPath);
                if (exitCode != 0)
                {
#if DEBUG
                    ToggleBusy(false, "Setup could not be completed for this debug session.");
#else
                    ToggleBusy(false, "Setup still needs elevation to finish configuring this PC.");
#endif
                    return;
                }

                PendingSetupStore.Delete(pendingSetupPath);
            }
            catch (Win32Exception ex) when (SetupCompletionLauncher.WasElevationCanceled(ex))
            {
#if DEBUG
                ToggleBusy(false, "Setup was canceled.");
#else
                ToggleBusy(false, "Setup still needs elevation to finish configuring this PC.");
#endif
                return;
            }

            DialogResult = DialogResult.OK;
            Close();
        }
        catch (PrismRegistrationException ex)
        {
            ToggleBusy(false, ex.Message);
            MessageBox.Show(this, ex.Message, "Registration failed", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
        catch (Win32Exception ex) when (ex.NativeErrorCode == 1223)
        {
#if DEBUG
            ToggleBusy(false, "Setup was canceled.");
#else
            ToggleBusy(false, "Setup needs elevation to store machine-wide credentials.");
#endif
        }
        catch (Exception ex)
        {
            ToggleBusy(false, ex.Message);
            MessageBox.Show(this, ex.Message, "Setup failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void ToggleBusy(bool isBusy, string statusText)
    {
        txtServerName.Enabled = !isBusy;
        txtDeviceName.Enabled = !isBusy;
        txtRegistrationCode.Enabled = !isBusy;
        btnRegister.Enabled = !isBusy;
        btnCancel.Enabled = !isBusy;
        lblStatus.Text = statusText;
    }
}
