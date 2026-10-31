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
  /** งานของฉันวันนี้ — หน้าแรกของช่าง */
  MyJobs: undefined;
  HomeMenu: undefined;
  ReportsMenu: undefined;
  Report: { kind: ReportKind; title: string };
  /** รายงานใบงานแยกตามผู้เปิด — เลือกช่วงวันที่เอง ไม่ได้ใช้หน้ารายงานทั่วไป */
  OpenerReport: undefined;
  /** รายงานทั้งระบบ — แอดมินเท่านั้น */
  SystemReport: undefined;
  /** สรุปเคสที่คอนเฟิร์มลูกค้าแล้ว — คัดลอกส่งกลุ่มไลน์ช่าง */
  ConfirmedReport: undefined;
  PartsOutReport: undefined;
  /** อะไหล่เบิกแล้ว · งานยังไม่จบ — ของออกจากคลังแล้ว ค้างอยู่ใบไหน */
  IssuedPartsReport: undefined;
  /**
   * ประวัติเคลม — ทุกชิ้นที่ช่างเคยส่งเคลม · branchCode/machineCode = มาจากลิงก์ "เคลมเครื่องนี้/สาขานี้ทั้งหมด"
   * ในใบงาน (กรองตรงตัว ทุกช่วงเวลา) · เปิดจากเมนูส่ง {} เพื่อล้างตัวกรองที่ค้างจากลิงก์
   */
  ClaimHistory: { branchCode?: string; machineCode?: string } | undefined;
  /**
   * อะไหล่ที่ไปแต่ละสาขา — แอดมินและ Super Admin · branchCode/machineId = มาจากลิงก์ "อะไหล่ที่สาขานี้ได้ไปแล้ว"
   * / "เฉพาะเครื่องนี้" ในใบงาน (ทั้งหมดตั้งแต่เริ่มใช้ระบบ) · branchName/machineCode ไว้เขียนป้ายตัวกรองเท่านั้น
   * (id เครื่องอ่านไม่ออก) · เปิดจากเมนูส่ง {} เพื่อล้างตัวกรองที่ค้างจากลิงก์
   */
  BranchPartsReport: { branchCode?: string; branchName?: string; machineId?: number; machineCode?: string } | undefined;
  MachineDashboard: undefined;
  MachineImport: undefined;
  /** inbox = เปิดมาที่กล่องงานของตัวเองเลย ไม่ใช่รายการรวม · search = ค้นต่อจากงานของฉันวันนี้ (ค้นในใบทั้งหมด) */
  WorkOrderList: { inbox?: boolean; search?: string } | undefined;
  // มาจากกระดานได้ ถ้าเปิดจากเคสจะพกรหัสเคสกับข้อความตั้งต้นมาด้วย
  // machineCode ติดมาจากกระดานเพื่อเติมรุ่นกับขนาดที่เคยกรอกไว้ของเครื่องตัวนั้น
  // ฟอร์มไม่มีช่องรหัสเครื่องในทางนี้ จึงหาเองจากที่พิมพ์ไม่ได้เหมือนทางเปิดเอง
  WorkOrderForm:
    | { outageId?: number; presetTitle?: string; branchCode?: string; machineCode?: string }
    | undefined;
  /** open = เปิดฟอร์มให้เลยเมื่อโหลดเสร็จ (มาจากปุ่มบนการ์ดงานของฉัน) · reschedule = แอดมินเลื่อนวันนัด */
  WorkOrderDetail: { id: number; open?: "close" | "stage" | "problem" | "reschedule" };
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
  /** ผังผู้รับผิดชอบพื้นที่ — ทุกคนดูได้ แอดมินลากแก้ได้ */
  CoverageMap: undefined;
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
  FleetDashboard: undefined;
  VehicleLogAdmin: undefined;
  ManageBranches: undefined;
  ManageUsers: undefined;
  ManageTeams: undefined;
  Backup: undefined;
  AppUsage: undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  WorkOrdersTab: undefined;
  HistoryTab: undefined;
  AdminTab: undefined;
};
