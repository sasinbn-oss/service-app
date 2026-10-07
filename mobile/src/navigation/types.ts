export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

/** Tab 1 — the jobs a technician does in the field. */
/** ใบรายงานที่มี — ต้องตรงกับ REPORT_KINDS ฝั่ง backend */
export type ReportKind = "daily" | "weekly" | "monthly" | "parts";

export type HomeStackParamList = {
  /** บอร์ดแผนงาน — หน้าแรกของแอดมินกับหัวหน้าภาค */
  PlanBoard: undefined;
  HomeMenu: undefined;
  ReportsMenu: undefined;
  Report: { kind: ReportKind; title: string };
  MachineDashboard: undefined;
  MachineImport: undefined;
  /** inbox = เปิดมาที่กล่องงานของตัวเองเลย ไม่ใช่รายการรวม */
  WorkOrderList: { inbox?: boolean } | undefined;
  // มาจากกระดานได้ ถ้าเปิดจากเคสจะพกรหัสเคสกับข้อความตั้งต้นมาด้วย
  // machineCode ติดมาจากกระดานเพื่อเติมรุ่นกับขนาดที่เคยกรอกไว้ของเครื่องตัวนั้น
  // ฟอร์มไม่มีช่องรหัสเครื่องในทางนี้ จึงหาเองจากที่พิมพ์ไม่ได้เหมือนทางเปิดเอง
  WorkOrderForm:
    | { outageId?: number; presetTitle?: string; branchCode?: string; machineCode?: string }
    | undefined;
  WorkOrderDetail: { id: number };
  TransferDocument: undefined;
  FlowList: undefined;
  FlowRun: { id: number; title: string };
  SparePartList: undefined;
  SparePartDetail: { id: number };
  BranchCheckIn: undefined;
  WorkLogForm: undefined;
  VehicleCheckIn: undefined;
  ConsumableRequest: undefined;
  ChangePassword: undefined;
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
  ManageUsers: undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  WorkOrdersTab: undefined;
  HistoryTab: undefined;
  AdminTab: undefined;
};
