using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using prismshared;

namespace prismagent;

internal sealed class TrayApplicationContext : ApplicationContext
{
    private readonly frmAgent statusForm;
    private readonly NotifyIcon notifyIcon;
    private readonly ContextMenuStrip contextMenu;
    private readonly System.Windows.Forms.Timer statusTimer;
    private bool exiting;
    private bool initializedMessageTracking;
    private bool processingScreenshotRequest;
    private string? lastNotifiedMessageId;

    public TrayApplicationContext()
    {
        statusForm = new frmAgent();
        statusForm.FormClosing += StatusForm_FormClosing;

        contextMenu = new ContextMenuStrip();
        contextMenu.Items.Add("Open Status", null, (_, _) => ShowStatusWindow());
        contextMenu.Items.Add("Run Setup", null, (_, _) => RunSetup());
#if DEBUG
        contextMenu.Items.Add(new ToolStripSeparator());
        contextMenu.Items.Add("Exit", null, (_, _) => ExitApplication());
#endif

        notifyIcon = new NotifyIcon
        {
            Icon = SystemIcons.Application,
            Text = "Family Prism Agent",
            Visible = true,
            ContextMenuStrip = contextMenu
        };
        notifyIcon.DoubleClick += (_, _) => ShowStatusWindow();

        statusTimer = new System.Windows.Forms.Timer
        {
            Interval = 2000
        };
        statusTimer.Tick += (_, _) => RefreshStatus();
        statusTimer.Start();

        RefreshStatus();
        RunStartupFlow();
    }

    private void RunStartupFlow()
    {
        var setupIsComplete = PrismStatusStore.IsSetupComplete();
        var hasPendingSetup = PendingSetupStore.HasPendingSetup();

        if (SetupFlow.ShouldCompletePending(SetupInvocation.Startup, setupIsComplete, hasPendingSetup))
        {
            if (!TryCompletePendingSetup())
            {
                return;
            }
        }
        else if (SetupFlow.ShouldShowRegistrationForm(SetupInvocation.Startup, setupIsComplete, hasPendingSetup))
        {
            var completed = ShowSetupDialog();
            if (!completed && !PrismStatusStore.IsSetupComplete())
            {
                ExitApplication();
                return;
            }
        }

        EnsureLocalRuntimeStarted();
        RefreshStatus();
    }

    private bool ShowSetupDialog()
    {
        using var registrationForm = new frmRegistration(PrismStatusStore.ReadOrDefault());
        var result = registrationForm.ShowDialog();
        if (result == DialogResult.OK)
        {
            EnsureLocalRuntimeStarted();
            notifyIcon.ShowBalloonTip(
                4000,
                "Family Prism",
                "Setup completed successfully.",
                ToolTipIcon.Info);
            return true;
        }

        return false;
    }

    private void RunSetup()
    {
        var setupIsComplete = PrismStatusStore.IsSetupComplete();
        var hasPendingSetup = PendingSetupStore.HasPendingSetup();

        if (SetupFlow.ShouldCompletePending(SetupInvocation.TrayMenu, setupIsComplete, hasPendingSetup))
        {
            if (TryCompletePendingSetup())
            {
                RefreshStatus();
            }

            return;
        }

        PendingSetupStore.DeleteAll();

        if (ShowSetupDialog())
        {
            RefreshStatus();
        }
    }

    private void RefreshStatus()
    {
        var status = PrismStatusStore.ReadOrDefault();
        statusForm.ApplyStatus(status);
        notifyIcon.Text = TruncateTooltip($"Family Prism Agent - {status.ConnectionState}");

        if (!initializedMessageTracking)
        {
            initializedMessageTracking = true;
            lastNotifiedMessageId = status.LastMessageId;
            return;
        }

        if (!string.IsNullOrWhiteSpace(status.LastMessageId)
            && !string.Equals(status.LastMessageId, lastNotifiedMessageId, StringComparison.Ordinal)
            && !string.IsNullOrWhiteSpace(status.LastMessageText))
        {
            lastNotifiedMessageId = status.LastMessageId;
            notifyIcon.ShowBalloonTip(
                5000,
                "Family Prism",
                status.LastMessageText,
                ToolTipIcon.Info);
        }

        StartPendingScreenshotCaptureIfNeeded();
    }

    private void ShowStatusWindow()
    {
        statusForm.Show();
        statusForm.WindowState = FormWindowState.Normal;
        statusForm.BringToFront();
        statusForm.Activate();
    }

    private void StatusForm_FormClosing(object? sender, FormClosingEventArgs e)
    {
        if (exiting)
        {
            return;
        }

        e.Cancel = true;
        statusForm.Hide();
    }

    private void ExitApplication()
    {
        exiting = true;
        statusTimer.Stop();
        notifyIcon.Visible = false;
        notifyIcon.Dispose();
        statusForm.Close();
        contextMenu.Dispose();
        ExitThread();
    }

    private static string TruncateTooltip(string value)
    {
        const int maximumLength = 63;
        return value.Length <= maximumLength
            ? value
            : value[..maximumLength];
    }

    private void StartPendingScreenshotCaptureIfNeeded()
    {
        if (processingScreenshotRequest || !PendingScreenshotRequestStore.HasPendingRequest())
        {
            return;
        }

        processingScreenshotRequest = true;
        try
        {
            ProcessPendingScreenshotRequest();
        }
        finally
        {
            processingScreenshotRequest = false;
        }
    }

    private void ProcessPendingScreenshotRequest()
    {
        try
        {
            if (PendingScreenshotRequestStore.Read() is null)
            {
                return;
            }

            var screenshot = CapturePrimaryScreenAsPng();
            PendingScreenshotImageStore.Write(screenshot);
        }
        catch (Exception)
        {
            notifyIcon.ShowBalloonTip(
                5000,
                "Family Prism",
                "Screenshot capture failed.",
                ToolTipIcon.Warning);
        }
        finally
        {
            PendingScreenshotRequestStore.Delete();
        }
    }

    private static byte[] CapturePrimaryScreenAsPng()
    {
        var width = GetSystemMetrics(0);
        var height = GetSystemMetrics(1);
        if (width <= 0 || height <= 0)
        {
            throw new InvalidOperationException("The primary display bounds could not be determined.");
        }

        using var bitmap = new Bitmap(width, height);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.CopyFromScreen(0, 0, 0, 0, new Size(width, height));

        using var stream = new MemoryStream();
        bitmap.Save(stream, ImageFormat.Png);
        return stream.ToArray();
    }

    [DllImport("user32.dll")]
    private static extern int GetSystemMetrics(int nIndex);

    private static void EnsureLocalRuntimeStarted()
    {
#if DEBUG
        if (!PrismStatusStore.IsSetupComplete())
        {
            return;
        }

        var bundledServicePath = Path.Combine(PrismPaths.BundledServiceDirectory, "prismsvc.exe");
        if (!File.Exists(bundledServicePath))
        {
            return;
        }

        if (Process.GetProcessesByName("prismsvc").Length > 0)
        {
            return;
        }

        Process.Start(new ProcessStartInfo
        {
            FileName = bundledServicePath,
            WorkingDirectory = Path.GetDirectoryName(bundledServicePath) ?? AppContext.BaseDirectory,
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden
        });
#endif
    }

    private bool TryCompletePendingSetup()
    {
        var pendingSetupPath = PendingSetupStore.GetMostRecentPendingSetupPath();
        if (string.IsNullOrWhiteSpace(pendingSetupPath))
        {
            return false;
        }

        try
        {
            var exitCode = SetupCompletionLauncher.RunAsync(pendingSetupPath).GetAwaiter().GetResult();
            if (exitCode == 0)
            {
                notifyIcon.ShowBalloonTip(
                    4000,
                    "Family Prism",
#if DEBUG
                    "Debug setup completed successfully.",
#else
                    "Machine-wide setup completed successfully.",
#endif
                    ToolTipIcon.Info);
                return true;
            }
        }
        catch (Win32Exception ex) when (SetupCompletionLauncher.WasElevationCanceled(ex))
        {
            notifyIcon.ShowBalloonTip(
                4000,
                "Family Prism",
#if DEBUG
                "Setup was canceled.",
#else
                "Setup still needs elevation before the agent can finish configuring this PC.",
#endif
                ToolTipIcon.Warning);
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                ex.Message,
                "Family Prism setup",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }

        return false;
    }
}
