export const ProjectDebugLauncherScreen = {
  title: 'Project Debug with AI',
  sourceArchiveOwner: '@connectingmatrix/file',
  sourceFlow: ['download source archive', 'File.unzip / File.createSourceArchiveAdapter', 'mount temporary source session', 'debug/build/deploy'],
  browserOnlyChat: true,
  debugEventsPersistedTo: 'ClickHouse sink when bound',
};
