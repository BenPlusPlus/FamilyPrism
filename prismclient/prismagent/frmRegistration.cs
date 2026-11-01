using System.ComponentModel;
using prismshared;

namespace prismagent;

public sealed partial class frmRegistration : Form
{
    private readonly PrismApiClient apiClient = new();

    public frmRegistration(PrismStatusSnapshot currentStatus)
    {
        InitializeComponent();

        txtServerName.Text = currentStatus.ServerBaseUrl ?? string.Empty;
        txtDeviceName.Text = currentStatus.ClientName ?? Environment.MachineName;
    }

    private void btnCancel_Click(object? sender, EventArgs e)
    {
        Close();
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
