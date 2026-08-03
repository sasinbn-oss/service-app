export const ROLES = ["EMPLOYEE", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const VEHICLE_STATUSES = ["AVAILABLE", "IN_USE", "MAINTENANCE"] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const VEHICLE_LOG_STATUSES = ["ONGOING", "COMPLETED"] as const;
export type VehicleLogStatus = (typeof VEHICLE_LOG_STATUSES)[number];

export const REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
