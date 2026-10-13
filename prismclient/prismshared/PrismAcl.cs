using System.Security.AccessControl;
using System.Security.Principal;

namespace prismshared;

internal static class PrismAcl
{
    public static void ApplySystemAndAdministratorsOnly(DirectoryInfo directory)
    {
        if (!PrismBuildMode.UsesMachineScope)
        {
            return;
        }

        directory.SetAccessControl(CreateSystemAndAdministratorsSecurity());
    }

    public static DirectorySecurity CreateSystemAndAdministratorsSecurity()
    {
        var security = new DirectorySecurity();
        security.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);
        AddFullControlRule(security, WellKnownSidType.LocalSystemSid);
        AddFullControlRule(security, WellKnownSidType.BuiltinAdministratorsSid);
        return security;
    }

    public static DirectorySecurity CreateStateDirectorySecurity()
    {
        var security = CreateSystemAndAdministratorsSecurity();
        security.AddAccessRule(new FileSystemAccessRule(
            new SecurityIdentifier(WellKnownSidType.BuiltinUsersSid, null),
            FileSystemRights.Modify | FileSystemRights.Synchronize,
            InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit,
            PropagationFlags.None,
            AccessControlType.Allow));
        return security;
    }

    private static void AddFullControlRule(DirectorySecurity security, WellKnownSidType sidType)
    {
        security.AddAccessRule(new FileSystemAccessRule(
            new SecurityIdentifier(sidType, null),
            FileSystemRights.FullControl,
            InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit,
            PropagationFlags.None,
            AccessControlType.Allow));
    }
}
