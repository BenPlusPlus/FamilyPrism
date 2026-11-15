using System.Text;

namespace prismbridge.service;

internal static class ConsolePrompt
{
    public static string Ask(string label, string? defaultValue = null)
    {
        while (true)
        {
            Console.Write(defaultValue is null ? $"{label}: " : $"{label} [{defaultValue}]: ");
            var line = Console.ReadLine();
            if (line is null && defaultValue is null)
            {
                throw new InvalidOperationException($"{label.Trim()} is required.");
            }

            var value = line?.Trim();
            if (!string.IsNullOrEmpty(value))
            {
                return value;
            }

            if (defaultValue is not null)
            {
                return defaultValue;
            }
        }
    }

    /// <summary>Reads without echoing, so the password never shows on screen or in scrollback.</summary>
    public static string AskSecret(string label)
    {
        while (true)
        {
            Console.Write($"{label}: ");
            if (Console.IsInputRedirected)
            {
                // Scripted setup: there is no screen to hide the password from.
                var line = Console.ReadLine();
                Console.WriteLine();
                if (line is null)
                {
                    throw new InvalidOperationException($"{label.Trim()} is required.");
                }

                if (line.Length > 0)
                {
                    return line;
                }

                continue;
            }

            var value = new StringBuilder();
            while (true)
            {
                var key = Console.ReadKey(intercept: true);
                if (key.Key == ConsoleKey.Enter)
                {
                    Console.WriteLine();
                    break;
                }

                if (key.Key == ConsoleKey.Backspace)
                {
                    if (value.Length > 0)
                    {
                        value.Length--;
                    }
                }
                else if (!char.IsControl(key.KeyChar))
                {
                    value.Append(key.KeyChar);
                }
            }

            if (value.Length > 0)
            {
                return value.ToString();
            }
        }
    }

    public static bool Confirm(string question)
    {
        Console.Write($"{question}? [y/N]: ");
        return Console.ReadLine()?.Trim().StartsWith('y') == true;
    }
}
