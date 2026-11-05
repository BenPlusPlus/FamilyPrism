using System.Diagnostics.CodeAnalysis;

namespace prismshared;

public sealed class TraySessionMutex : IDisposable
{
    // Local\ is per Windows session so console and RDP Trays can coexist.
    public const string Name = @"Local\FamilyPrism.prismagent";

    private Mutex? mutex;

    private TraySessionMutex(Mutex mutex)
    {
        this.mutex = mutex;
    }

    public static bool TryAcquire([NotNullWhen(true)] out TraySessionMutex? instance)
        => TryAcquire(Name, out instance);

    public static bool TryAcquire(string name, [NotNullWhen(true)] out TraySessionMutex? instance)
    {
        Mutex? acquired = null;
        try
        {
            acquired = new Mutex(initiallyOwned: true, name, out var createdNew);
            if (!createdNew)
            {
                // createdNew can be false after a killed owner until the object rundowns.
                // WaitOne(0) takes an abandoned or unowned mutex; a live holder still loses.
                try
                {
                    if (!acquired.WaitOne(TimeSpan.Zero))
                    {
                        acquired.Dispose();
                        instance = null;
                        return false;
                    }
                }
                catch (AbandonedMutexException)
                {
                }
            }

            instance = new TraySessionMutex(acquired);
            return true;
        }
        catch
        {
            acquired?.Dispose();
            throw;
        }
    }

    public void Dispose()
    {
        if (mutex is null)
        {
            return;
        }

        try
        {
            mutex.ReleaseMutex();
        }
        catch (ApplicationException)
        {
        }

        mutex.Dispose();
        mutex = null;
    }
}
