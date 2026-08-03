export type Role = "EMPLOYEE" | "ADMIN";

export interface User {
  id: number;
  employeeCode: string;
  name: string;
  phone?: string | null;
  role: Role;
}

export type VehicleStatus = "AVAILABLE" | "IN_USE" | "MAINTENANCE";

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
  latitude: number;
  longitude: number;
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
