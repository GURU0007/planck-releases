using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;

[assembly: AssemblyTitle("Planck-Stealth Setup")]
[assembly: AssemblyProduct("Planck Stealth")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace PlanckInstaller {
    static class Program {
        [STAThread]
        static void Main() {
            try {
                string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string installDir = Path.Combine(localAppData, "Programs", "Planck-Stealth");
                string targetExe = Path.Combine(installDir, "Planck-Stealth.exe");
                string selfPath = Assembly.GetExecutingAssembly().Location;

                // Extract embedded ZIP payload from executable
                using (FileStream fs = new FileStream(selfPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite)) {
                    byte[] buffer = new byte[8192];
                    long zipStart = -1;
                    int read;

                    // Scan for PK\x03\x04 signature
                    while ((read = fs.Read(buffer, 0, buffer.Length)) > 0) {
                        for (int i = 0; i < read - 3; i++) {
                            if (buffer[i] == 0x50 && buffer[i + 1] == 0x4B && buffer[i + 2] == 0x03 && buffer[i + 3] == 0x04) {
                                zipStart = fs.Position - read + i;
                                break;
                            }
                        }
                        if (zipStart != -1) break;
                    }

                    if (zipStart != -1) {
                        fs.Seek(zipStart, SeekOrigin.Begin);
                        using (ZipArchive archive = new ZipArchive(fs, ZipArchiveMode.Read)) {
                            Directory.CreateDirectory(installDir);
                            foreach (ZipArchiveEntry entry in archive.Entries) {
                                if (string.IsNullOrEmpty(entry.Name)) continue;
                                string destPath = Path.Combine(installDir, entry.FullName);
                                Directory.CreateDirectory(Path.GetDirectoryName(destPath));
                                entry.ExtractToFile(destPath, true);
                            }
                        }
                    }
                }

                // Launch the application
                if (File.Exists(targetExe)) {
                    ProcessStartInfo psi = new ProcessStartInfo(targetExe) {
                        WorkingDirectory = installDir,
                        UseShellExecute = true
                    };
                    Process.Start(psi);
                }
            } catch {
                // Silently handle any non-fatal errors
            }
        }
    }
}
