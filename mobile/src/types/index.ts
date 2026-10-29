export type Role = "EMPLOYEE" | "SUPERVISOR" | "ADMIN" | "PARTS_ADMIN" | "SUPER_ADMIN" | "AREA" | "COCO_SUPERVISOR" | "COCO_MAID";

export interface User {
  id: number;
  employeeCode: string;
  name: string;
  phone?: string | null;
  role: Role;
  /** ภาคที่หัวหน้าภาคดูแล — ว่างสำหรับบทบาทอื่น */
  region?: string | null;
  /** ทีมช่างที่สังกัด — ตัวบอกว่าช่างคนนี้เห็นงานของทีมไหน ว่างสำหรับบทบาทอื่น */
  team?: string | null;
  /**
   * ทีมที่ช่างคนนี้เห็นงาน — ทีมช่างธรรมดา = [team] · ทีมรวม = ทุกทีมที่ครอบคลุม · all = ทุกทีม
   * ใช้ตัดสินว่าใบงานที่จ่ายให้ทีมไหน "เป็นงานของฉัน" (ปุ่มของขั้นตอน)
   */
  teamCoverage?: { all: boolean; teams: string[] } | null;
  /** ทีมที่หัวหน้าภาคดูแล (หลายทีมได้) — ขอบเขตงานของหัวหน้าภาคที่ไม่ได้ตั้งภาค */
  supervisedTeams?: string[];
  /** true = ยังใช้รหัสตั้งต้นที่แอดมินให้มา ต้องเปลี่ยนก่อนใช้งาน */
  mustChangePassword?: boolean;
  /** มีค่า = Super Admin กำลังดูแอปในฐานะผู้ใช้คนนี้ (ดูได้อย่างเดียว) — แสดงแถบเตือนค้างด้านบน */
  viewAs?: { byName: string; expiresAt: string };
  /**
   * true = Super Admin (ตั้ง/ถอดแอดมินได้) — role ของผู้ใช้ที่ล็อกอินอยู่ถูกมองเป็น "ADMIN"
   * แบบเดียวกับฝั่งเซิร์ฟเวอร์ ทุกที่ที่เช็ค role === "ADMIN" จึงใช้ได้โดยไม่ต้องไล่แก้
   * ตั้งใน AuthContext เท่านั้น
   */
  superAdmin?: boolean;
  /** true = แอดมินอะไหล่ (คนเช็คประกัน) — role ถูกมองเป็น "ADMIN" แบบเดียวกับ superAdmin ตั้งใน AuthContext */
  partsAdmin?: boolean;
}

export type VehicleStatus = "AVAILABLE" | "IN_USE" | "MAINTENANCE" | "INACTIVE";

export interface Vehicle {
  id: number;
  plateNumber: string;
  brand?: string | null;
  model?: string | null;
  type?: string | null;
  status: VehicleStatus;
}

export type VehicleLogStatus = "ONGOING" | "COMPLETED";

export interface VehicleLog {
  id: number;
  vehicleId: number;
  userId: number;
  purpose: string;
  destination?: string | null;
  startMileage: number;
  endMileage?: number | null;
  startedAt: string;
  endedAt?: string | null;
  status: VehicleLogStatus;
  vehicle: Vehicle;
}

export interface Branch {
  id: number;
  name: string;
  code: string;
  address?: string | null;
  // สาขาที่นำเข้าจากทะเบียนส่วนใหญ่ยังไม่มีพิกัด (ฐานข้อมูลเป็น Float?) — ประกาศตามจริง
  // เดิมประกาศว่ามีเสมอ หน้าจัดการสาขาเลยเรียก .toFixed บน null แล้วค้างจอขาวทั้งหน้า (ต.ค. 69)
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
}

export interface BranchCheckIn {
  id: number;
  userId: number;
  branchId: number;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  withinRadius: boolean;
  note?: string | null;
  checkedInAt: string;
  branch: Branch;
}

export interface WorkLog {
  id: number;
  userId: number;
  workDate: string;
  taskDescription: string;
  hoursSpent?: number | null;
  branchId?: number | null;
  branch?: Branch | null;
  createdAt: string;
}

export interface TroubleshootingGuide {
  id: number;
  category: string;
  title: string;
  symptom: string;
  solution: string;
  createdAt: string;
  updatedAt: string;
}

export interface SparePart {
  id: number;
  partCode: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  /** Part No. ของผู้ผลิต (จากไฟล์อะไหล่ Huebsch/Maytag) — หลายเลขคั่นด้วย ", " */
  partNo?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsumableItem {
  id: number;
  name: string;
  unit: string;
  stockQty: number;
  createdAt: string;
}

export type RequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface ConsumableRequestItem {
  id: number;
  requestId: number;
  itemId: number;
  quantity: number;
  item: ConsumableItem;
}

export interface ConsumableRequest {
  id: number;
  userId: number;
  status: RequestStatus;
  note?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  items: ConsumableRequestItem[];
  user: Pick<User, "id" | "name" | "employeeCode">;
  reviewedBy?: Pick<User, "id" | "name" | "employeeCode"> | null;
}

export type FlowNodeKind = "QUESTION" | "ACTION";

export interface TroubleshootNode {
  id: number;
  flowId: number;
  key: string;
  kind: FlowNodeKind;
  text: string;
  stepNumber?: string | null;
  yesKey?: string | null;
  noKey?: string | null;
  order: number;
}

/** Shape returned by the list endpoint. */
export interface TroubleshootFlowSummary {
  id: number;
  title: string;
  machineType?: string | null;
  notes?: string | null;
  questionCount: number;
  imageCount: number;
  incompleteCount: number;
  isReady: boolean;
}

export interface TroubleshootFlow {
  id: number;
  title: string;
  machineType?: string | null;
  notes?: string | null;
  rootKey?: string | null;
  sourceFile?: string | null;
  nodes: TroubleshootNode[];
  images: { id: number; url: string }[];
}
