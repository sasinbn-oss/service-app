export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type MainStackParamList = {
  Home: undefined;

  // 1. Troubleshooting guide
  GuideList: undefined;
  GuideDetail: { id: number };

  // 2. Spare part list
  SparePartList: undefined;
  SparePartDetail: { id: number };

  // 3. Branch check-in
  BranchCheckIn: undefined;
  BranchHistory: undefined;

  // 4. Work logs
  WorkLogForm: undefined;
  WorkLogHistory: undefined;

  // 5. Vehicle usage
  VehicleCheckIn: undefined;
  VehicleHistory: undefined;

  // 6. Consumable requisition
  ConsumableRequest: undefined;
  MyConsumableRequests: undefined;

  // Admin
  ReviewRequests: undefined;
  ManageGuides: undefined;
  ManageSpareParts: undefined;
  ManageConsumables: undefined;
  ManageVehicles: undefined;
  ManageBranches: undefined;
};
