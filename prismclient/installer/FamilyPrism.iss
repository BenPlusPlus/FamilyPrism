; Family Prism client installer.
; Compiles from the framework-dependent publish output of prismagent + prismsvc.
; .NET Desktop Runtime 10 is installed when missing via InnoDependencyInstaller:
; https://github.com/DomGries/InnoDependencyInstaller

#ifndef MyAppVersion
  #define MyAppVersion "0.1.3"
#endif
#ifndef PublishDir
  #define PublishDir "..\artifacts\publish\win-x64"
#endif
#ifndef OutputDir
  #define OutputDir "..\artifacts\installer"
#endif

#define MyAppName "Family Prism"
#define MyAppPublisher "Family Prism"
#define MyAppExeName "prismagent.exe"
#define MyServiceName "prismsvc"
#define MyServiceDisplayName "Family Prism Service"
#define MyLogonTaskName "Family Prism Agent"

[Setup]
AppId={{8F3C1B6A-94D2-4E70-9C5A-2B7E6D4F8A11}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppMutex=FamilyPrism.prismagent
SetupMutex=FamilyPrism.Setup
DefaultDirName={autopf}\FamilyPrism
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir={#OutputDir}
OutputBaseFilename=FamilyPrismSetup-{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
CloseApplications=yes
RestartApplications=no
SetupLogging=yes
UsePreviousAppDir=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#PublishDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.pdb,*.xml,appsettings.Development.json,createdump.exe"

[Dirs]
Name: "{commonappdata}\FamilyPrism"
Name: "{commonappdata}\FamilyPrism\Config"
Name: "{commonappdata}\FamilyPrism\State"
Name: "{commonappdata}\FamilyPrism\Updates"

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Run Family Prism setup"; Flags: nowait postinstall skipifsilent runasoriginaluser

[Code]
#include "CodeDependencies.iss"

function ExecHidden(const Filename, Params: String): Integer;
begin
  Log('Exec: "' + Filename + '" ' + Params);
  if not Exec(Filename, Params, '', SW_HIDE, ewWaitUntilTerminated, Result) then
  begin
    Log('Exec failed: ' + Filename + ' ' + Params);
    Result := -1;
  end
  else
    Log('Exec exit code ' + IntToStr(Result) + ': ' + Filename);
end;

procedure StopPrismService;
begin
  if ExecHidden(ExpandConstant('{sys}\sc.exe'), 'query {#MyServiceName}') = 0 then
  begin
    ExecHidden(ExpandConstant('{sys}\sc.exe'), 'stop {#MyServiceName}');
    Sleep(2000);
  end;
end;

procedure ApplyDataDirectoryAcls;
var
  ConfigDir, StateDir, UpdatesDir: String;
begin
  ConfigDir := ExpandConstant('{commonappdata}\FamilyPrism\Config');
  StateDir := ExpandConstant('{commonappdata}\FamilyPrism\State');
  UpdatesDir := ExpandConstant('{commonappdata}\FamilyPrism\Updates');

  ExecHidden(ExpandConstant('{sys}\icacls.exe'),
    '"' + ConfigDir + '" /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" /grant:r "*S-1-5-32-544:(OI)(CI)F"');
  ExecHidden(ExpandConstant('{sys}\icacls.exe'),
    '"' + StateDir + '" /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" /grant:r "*S-1-5-32-544:(OI)(CI)F" /grant:r "*S-1-5-32-545:(OI)(CI)M"');
  ExecHidden(ExpandConstant('{sys}\icacls.exe'),
    '"' + UpdatesDir + '" /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" /grant:r "*S-1-5-32-544:(OI)(CI)F"');
end;

procedure InstallPrismService;
var
  BinPath: String;
begin
  BinPath := '"' + ExpandConstant('{app}\Service\prismsvc.exe') + '"';
  if ExecHidden(ExpandConstant('{sys}\sc.exe'), 'query {#MyServiceName}') = 0 then
    ExecHidden(ExpandConstant('{sys}\sc.exe'),
      'config {#MyServiceName} binPath= ' + BinPath + ' start= auto DisplayName= "{#MyServiceDisplayName}"')
  else
    ExecHidden(ExpandConstant('{sys}\sc.exe'),
      'create {#MyServiceName} binPath= ' + BinPath + ' start= auto DisplayName= "{#MyServiceDisplayName}"');

  ExecHidden(ExpandConstant('{sys}\sc.exe'),
    'description {#MyServiceName} "Family Prism background agent service"');
  ExecHidden(ExpandConstant('{sys}\sc.exe'), 'start {#MyServiceName}');
end;

procedure InstallLogonTask;
var
  AgentPath: String;
begin
  AgentPath := ExpandConstant('{app}\{#MyAppExeName}');
  ExecHidden(ExpandConstant('{sys}\schtasks.exe'),
    '/Create /TN "{#MyLogonTaskName}" /TR "\"' + AgentPath + '\"" /SC ONLOGON /RL LIMITED /F');
end;

procedure RemoveLogonTask;
begin
  ExecHidden(ExpandConstant('{sys}\schtasks.exe'), '/Delete /TN "{#MyLogonTaskName}" /F');
end;

procedure RemovePrismService;
begin
  StopPrismService;
  ExecHidden(ExpandConstant('{sys}\sc.exe'), 'delete {#MyServiceName}');
end;

function InitializeSetup: Boolean;
begin
  Dependency_ForceX64 := True;
  Dependency_AddDotNet100Desktop;
  Result := True;
end;

<event('PrepareToInstall')>
function Prism_PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  StopPrismService;
  Result := '';
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    ApplyDataDirectoryAcls;
    InstallPrismService;
    InstallLogonTask;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then
  begin
    RemoveLogonTask;
    RemovePrismService;
  end;
end;
