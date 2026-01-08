using WSClip.Config;
using WSClip.Sync;
using WSClip.Utils;

namespace WSClip;

/// <summary>
/// WSClip - Clipboard Synchronization Client
/// </summary>
public static class Program
{
    private static readonly Logger _logger = Logger.Instance;
    
    public static async Task<int> Main(string[] args)
    {
        // Parse arguments
        var options = ParseArguments(args);
        
        if (options.ShowHelp)
        {
            PrintHelp();
            return 0;
        }
        
        if (options.ShowVersion)
        {
            PrintVersion();
            return 0;
        }
        
        // Configure logging
        _logger.MinLevel = options.Verbose ? LogLevel.Debug : LogLevel.Info;
        
        PrintBanner();
        
        try
        {
            // Load or create configuration
            var config = await LoadOrCreateConfig(options.ConfigPath);
            
            if (config is null)
            {
                return 1;
            }
            
            // Run sync service
            return await RunSyncService(config);
        }
        catch (Exception ex)
        {
            _logger.Error("APP", $"Fatal error: {ex.Message}");
            if (options.Verbose)
            {
                _logger.Debug("APP", ex.ToString());
            }
            return 1;
        }
    }
    
    private static async Task<AppConfig?> LoadOrCreateConfig(string? configPath)
    {
        AppConfig? config = null;
        
        // Try custom path first
        if (!string.IsNullOrEmpty(configPath))
        {
            if (File.Exists(configPath))
            {
                config = await ConfigLoader.LoadAsync(configPath);
            }
            else
            {
                _logger.Error("CONFIG", $"Config file not found: {configPath}");
                return null;
            }
        }
        else
        {
            // Try default path
            var defaultPath = ConfigLoader.GetDefaultConfigPath();
            
            if (File.Exists(defaultPath))
            {
                config = await ConfigLoader.LoadAsync(defaultPath);
            }
        }
        
        // Validate existing config
        if (config is not null)
        {
            var result = ConfigValidator.Validate(config);
            
            if (!result.IsValid)
            {
                _logger.Warn("CONFIG", $"Configuration error: {result.ErrorMessage}");
                _logger.Info("CONFIG", "Running configuration wizard...");
                config = null;
            }
        }
        
        // Run wizard if no valid config
        if (config is null)
        {
            _logger.Info("CONFIG", "No valid configuration found. Starting setup wizard...\n");
            
            var configFilePath = configPath ?? ConfigLoader.GetDefaultConfigPath();
            config = await ConfigWizard.RunAsync(configFilePath);
        }
        
        return config;
    }
    
    private static async Task<int> RunSyncService(AppConfig config)
    {
        using var cts = new CancellationTokenSource();
        
        // Setup Ctrl+C handler
        Console.CancelKeyPress += (_, e) =>
        {
            e.Cancel = true;
            _logger.Info("APP", "Shutdown requested (Ctrl+C)");
            try
            {
                if (!cts.IsCancellationRequested)
                    cts.Cancel();
            }
            catch (ObjectDisposedException)
            {
                // Already disposed, ignore
            }
        };
        
        // Setup SIGTERM handler
        AppDomain.CurrentDomain.ProcessExit += (_, _) =>
        {
            try
            {
                if (!cts.IsCancellationRequested)
                    cts.Cancel();
            }
            catch (ObjectDisposedException)
            {
                // Already disposed, ignore
            }
        };
        
        await using var syncService = new SyncService(config);
        
        try
        {
            await syncService.StartAsync(cts.Token);
            await syncService.RunAsync(cts.Token);
        }
        catch (OperationCanceledException)
        {
            // Normal shutdown
        }
        finally
        {
            await syncService.StopAsync();
        }
        
        _logger.Info("APP", "Goodbye!");
        return 0;
    }
    
    private static CommandLineOptions ParseArguments(string[] args)
    {
        var options = new CommandLineOptions();
        
        for (int i = 0; i < args.Length; i++)
        {
            var arg = args[i];
            
            switch (arg)
            {
                case "-h":
                case "--help":
                    options.ShowHelp = true;
                    break;
                    
                case "-v":
                case "--verbose":
                    options.Verbose = true;
                    break;
                    
                case "--version":
                    options.ShowVersion = true;
                    break;
                    
                case "-c":
                case "--config":
                    if (i + 1 < args.Length)
                    {
                        options.ConfigPath = args[++i];
                    }
                    break;
            }
        }
        
        return options;
    }
    
    private static void PrintBanner()
    {
        Console.WriteLine();
        Console.WriteLine("WSClip - Clipboard Synchronization Client");
        Console.WriteLine("==========================================");
        Console.WriteLine();
    }
    
    private static void PrintVersion()
    {
        Console.WriteLine("WSClip v1.0.0");
        Console.WriteLine(".NET Runtime: " + Environment.Version);
    }
    
    private static void PrintHelp()
    {
        Console.WriteLine("WSClip - Clipboard Synchronization Client");
        Console.WriteLine();
        Console.WriteLine("USAGE:");
        Console.WriteLine("  wsclip [OPTIONS]");
        Console.WriteLine();
        Console.WriteLine("OPTIONS:");
        Console.WriteLine("  -c, --config <PATH>  Path to configuration file");
        Console.WriteLine("  -v, --verbose        Enable verbose (debug) logging");
        Console.WriteLine("  -h, --help           Show this help message");
        Console.WriteLine("      --version        Show version information");
        Console.WriteLine();
        Console.WriteLine("CONFIGURATION:");
        Console.WriteLine("  On first run, a configuration wizard will guide you through setup.");
        Console.WriteLine("  Configuration is stored in:");
        Console.WriteLine($"    {ConfigLoader.GetDefaultConfigPath()}");
        Console.WriteLine();
        Console.WriteLine("EXAMPLES:");
        Console.WriteLine("  wsclip                      Run with default configuration");
        Console.WriteLine("  wsclip -v                   Run with verbose logging");
        Console.WriteLine("  wsclip -c ./myconfig.json   Run with custom config file");
    }
}

internal sealed class CommandLineOptions
{
    public bool ShowHelp { get; set; }
    public bool ShowVersion { get; set; }
    public bool Verbose { get; set; }
    public string? ConfigPath { get; set; }
}
