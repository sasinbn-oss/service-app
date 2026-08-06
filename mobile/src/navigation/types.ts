export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

/** Tab 1 — the jobs a technician does in the field. */
export type HomeStackParamList = {
  HomeMenu: undefined;
  TransferDocument: undefined;
  Assistant: undefined;
  FlowList: undefined;
  FlowRun: { id: number; title: string };
  SparePartList: undefined;
  SparePartDetail: { id: number };
  BranchCheckIn: undefined;
  WorkLogForm: undefined;
  VehicleCheckIn: undefined;
  ConsumableRequest: undefined;
};

/** Tab 2 — everything the user has already recorded. */
export type HistoryStackParamList = {
  HistoryMenu: undefined;
  BranchHistory: undefined;
  WorkLogHistory: undefined;
  VehicleHistory: undefined;
  MyConsumableRequests: undefined;
  GuideList: undefined;
  GuideDetail: { id: number };
};

/** Tab 3 — back-office management, admins only. */
export type AdminStackParamList = {
  AdminMenu: undefined;
  ReviewRequests: undefined;
  ManageFlows: undefined;
  ManageGuides: undefined;
  ManageSpareParts: undefined;
  ManageConsumables: undefined;
  ManageVehicles: undefined;
  ManageBranches: undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  HistoryTab: undefined;
  AdminTab: undefined;
};
