// lib/yubikey-api.ts
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export interface YubiKey {
    serial: number;
    version: string;
    form_factor: string;
    device_type: string;
}

export interface YubiKeyInfo {
    serial: number;
    version: string;
    form_factor: string;
    is_fips: boolean;
    is_sky: boolean;
}

export class YubiKeyAPI {
    static async listYubiKeys(): Promise<YubiKey[]> {
        const response = await fetch(`${API_BASE_URL}/api/yubikeys`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to list YubiKeys');
        }

        return data.yubikeys;
    }

    static async getYubiKeyInfo(serial: number): Promise<YubiKeyInfo> {
        const response = await fetch(`${API_BASE_URL}/api/yubikey/${serial}/info`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to get YubiKey info');
        }

        return data.info;
    }
}
