export type Role = 'user' | 'admin' | 'service-admin';

export type ServiceStatus = 'active' | 'coming_soon' | 'disabled';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
}

export interface ServiceCard {
  id: string;
  slug: string;
  name: string;
  description: string;
  iconUrl: string | null;
  url: string;
  status: ServiceStatus;
  category: string;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
}
