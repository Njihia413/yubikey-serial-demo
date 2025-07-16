"use client";

import { useState, useEffect, useCallback } from "react";
import { io } from "socket.io-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, Key, Database, Activity } from "lucide-react";

// Updated API interface
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export interface YubiKey {
  serial: number;
  version: string;
  form_factor: string;
  device_type: string;
  is_fips: boolean;
  is_sky: boolean;
}

export interface YubiKeyInfo extends YubiKey {
  id?: number;
  first_seen?: string;
  last_seen?: string;
  raw_info?: string;
}

export interface DatabaseStats {
  total_yubikeys: number;
  total_detections: number;
  recent_detections_24h: number;
}

export class YubiKeyAPI {
  static async listYubiKeys(autoSave: boolean = false): Promise<YubiKey[]> {
    const url = autoSave
      ? `${API_BASE_URL}/api/yubikeys?auto_save=true`
      : `${API_BASE_URL}/api/yubikeys`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || "Failed to list YubiKeys");
    }

    return data.yubikeys;
  }

  static async getYubiKeyInfo(
    serial: number,
    autoSave: boolean = false
  ): Promise<YubiKeyInfo> {
    const url = autoSave
      ? `${API_BASE_URL}/api/yubikey/${serial}/info?auto_save=true`
      : `${API_BASE_URL}/api/yubikey/${serial}/info`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || "Failed to get YubiKey info");
    }

    return data.info;
  }

  static async saveYubiKey(serial: number): Promise<YubiKeyInfo> {
    const response = await fetch(`${API_BASE_URL}/api/yubikey/${serial}/save`, {
      method: "POST",
    });
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || "Failed to save YubiKey");
    }

    return data.info;
  }

  static async getDatabaseYubiKeys(): Promise<YubiKeyInfo[]> {
    const response = await fetch(`${API_BASE_URL}/api/database/yubikeys`);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || "Failed to get database YubiKeys");
    }

    return data.yubikeys;
  }

  static async getDatabaseStats(): Promise<DatabaseStats> {
    const response = await fetch(`${API_BASE_URL}/api/database/stats`);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || "Failed to get database stats");
    }

    return data.stats;
  }
}

export default function YubiKeyManager() {
  const [yubiKeys, setYubiKeys] = useState<YubiKey[]>([]);
  const [databaseKeys, setDatabaseKeys] = useState<YubiKeyInfo[]>([]);
  const [selectedKey, setSelectedKey] = useState<YubiKeyInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const loadDatabaseKeys = useCallback(async () => {
    try {
      const keys = await YubiKeyAPI.getDatabaseYubiKeys();
      setDatabaseKeys(keys);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const statsData = await YubiKeyAPI.getDatabaseStats();
      setStats(statsData);
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  }, []);

  const loadYubiKeys = useCallback(async () => {
    setError(null);

    try {
      const keys = await YubiKeyAPI.listYubiKeys(true); // Always auto-save
      setYubiKeys(keys);
      await loadDatabaseKeys();
      await loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
    }
  }, [loadDatabaseKeys, loadStats]);

  const selectYubiKey = useCallback(
    async (serial: number) => {
      try {
        const info = await YubiKeyAPI.getYubiKeyInfo(serial, true); // Always auto-save
        setSelectedKey(info);
        await loadDatabaseKeys(); // Reload database keys after auto-save
        await loadStats();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    },
    [loadDatabaseKeys, loadStats]
  );

  useEffect(() => {
    const socket = io(API_BASE_URL);

    socket.on("connect", () => {
      console.log("Connected to WebSocket");
    });

    socket.on("disconnect", () => {
      console.log("Disconnected from WebSocket");
    });

    const handleYubiKeysUpdate = (data: { yubikeys: YubiKey[] }) => {
      console.log("Received yubikeys_update:", data);
      setYubiKeys(data.yubikeys || []);
      loadDatabaseKeys();
      loadStats();
    };

    socket.on("yubikeys_update", handleYubiKeysUpdate);

    // Initial data load
    loadYubiKeys();

    return () => {
      socket.off("yubikeys_update", handleYubiKeysUpdate);
      socket.disconnect();
    };
  }, [loadYubiKeys, loadDatabaseKeys, loadStats]);

  // This effect handles the logic of clearing the selected key
  useEffect(() => {
    // If a key is selected but it's no longer in the connected list, deselect it.
    if (
      selectedKey &&
      !yubiKeys.some((key) => key.serial === selectedKey.serial)
    ) {
      setSelectedKey(null);
    }
  }, [yubiKeys, selectedKey]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            YubiKey Manager
          </h1>
          <p className="text-gray-600">
            Manage and monitor your YubiKey security devices
          </p>
        </div>

        {/* Stats Dashboard */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50 to-blue-100">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-blue-700">
                  Total YubiKeys
                </CardTitle>
                <Key className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-800">
                  {stats.total_yubikeys}
                </div>
                <p className="text-xs text-blue-600 mt-1">
                  Unique devices registered
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-green-50 to-green-100">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-green-700">
                  Total Detections
                </CardTitle>
                <Activity className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-800">
                  {stats.total_detections}
                </div>
                <p className="text-xs text-green-600 mt-1">
                  Connection events logged
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-50 to-purple-100">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-purple-700">
                  Recent Activity
                </CardTitle>
                <Shield className="h-4 w-4 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-800">
                  {stats.recent_detections_24h}
                </div>
                <p className="text-xs text-purple-600 mt-1">
                  Detections in last 24h
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Controls */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Device Management
            </CardTitle>
            <CardDescription>
              Scan for connected devices and manage your YubiKey database
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
              <Button
                variant="default"
                onClick={loadDatabaseKeys}
                className="flex items-center justify-center gap-2 w-full sm:w-auto"
              >
                <Database className="h-4 w-4" />
                Refresh Database
              </Button>
            </div>
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Currently Connected YubiKeys */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5 text-green-600" />
                Currently Connected
              </CardTitle>
              <CardDescription>
                YubiKeys detected on this system
              </CardDescription>
            </CardHeader>
            <CardContent>
              {yubiKeys.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No YubiKeys found</p>
                  <p className="text-sm">Connect a YubiKey and click scan</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {yubiKeys.map((key) => (
                    <Card
                      key={key.serial}
                      className={`cursor-pointer transition-all hover:shadow-md ${
                        key.serial === selectedKey?.serial
                          ? "ring-2 ring-blue-500 bg-blue-50"
                          : "hover:bg-slate-50"
                      }`}
                      onClick={() => selectYubiKey(key.serial)}
                    >
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <div className="font-semibold">
                              Serial: {key.serial}
                            </div>
                            <div className="text-sm text-gray-600">
                              {key.version} • {key.form_factor}
                            </div>
                            <div className="flex gap-2 mt-2">
                              <Badge
                                variant={key.is_fips ? "default" : "secondary"}
                              >
                                FIPS: {key.is_fips ? "Yes" : "No"}
                              </Badge>
                              <Badge
                                variant={key.is_sky ? "default" : "secondary"}
                              >
                                SKY: {key.is_sky ? "Yes" : "No"}
                              </Badge>
                            </div>
                          </div>
                          <Shield className="h-5 w-5 text-blue-600" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Database YubiKeys */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-purple-600" />
                Database Records
              </CardTitle>
              <CardDescription>Previously detected YubiKeys</CardDescription>
            </CardHeader>
            <CardContent>
              {databaseKeys.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No YubiKeys in database</p>
                  <p className="text-sm">Scan devices to populate database</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {databaseKeys.map((key) => (
                    <Card key={key.id} className="bg-slate-50">
                      <CardContent className="p-4">
                        <div className="space-y-1">
                          <div className="font-semibold">
                            Serial: {key.serial}
                          </div>
                          <div className="text-sm text-gray-600">
                            {key.version} • {key.form_factor}
                          </div>
                          <div className="text-xs text-gray-500">
                            Last seen:{" "}
                            {key.last_seen
                              ? new Date(key.last_seen).toLocaleString()
                              : "Unknown"}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Selected YubiKey Details */}
        {selectedKey && (
          <Card className="border-0 shadow-lg bg-gradient-to-br from-indigo-50 to-indigo-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-indigo-600" />
                YubiKey Details
              </CardTitle>
              <CardDescription>
                Detailed information for selected device
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-white rounded-lg shadow-sm">
                    <span className="font-medium text-slate-600">
                      Serial Number
                    </span>
                    <span className="font-bold text-slate-900">
                      {selectedKey.serial}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white rounded-lg shadow-sm">
                    <span className="font-medium text-slate-600">Version</span>
                    <span className="font-bold text-slate-900">
                      {selectedKey.version}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white rounded-lg shadow-sm">
                    <span className="font-medium text-slate-600">
                      Form Factor
                    </span>
                    <span className="font-bold text-slate-900">
                      {selectedKey.form_factor}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white rounded-lg shadow-sm">
                    <span className="font-medium text-slate-600">
                      Device Type
                    </span>
                    <span className="font-bold text-slate-900">
                      {selectedKey.device_type}
                    </span>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-white rounded-lg shadow-sm">
                    <span className="font-medium text-slate-600">
                      FIPS Certified
                    </span>
                    <Badge
                      variant={selectedKey.is_fips ? "default" : "secondary"}
                    >
                      {selectedKey.is_fips ? "Yes" : "No"}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white rounded-lg shadow-sm">
                    <span className="font-medium text-slate-600">
                      SKY Compatible
                    </span>
                    <Badge
                      variant={selectedKey.is_sky ? "default" : "secondary"}
                    >
                      {selectedKey.is_sky ? "Yes" : "No"}
                    </Badge>
                  </div>
                  {selectedKey.first_seen && (
                    <div className="flex justify-between items-center p-3 bg-white rounded-lg shadow-sm">
                      <span className="font-medium text-slate-600">
                        First Seen
                      </span>
                      <span className="text-sm text-slate-700">
                        {new Date(selectedKey.first_seen).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {selectedKey.last_seen && (
                    <div className="flex justify-between items-center p-3 bg-white rounded-lg shadow-sm">
                      <span className="font-medium text-slate-600">
                        Last Seen
                      </span>
                      <span className="text-sm text-slate-700">
                        {new Date(selectedKey.last_seen).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
