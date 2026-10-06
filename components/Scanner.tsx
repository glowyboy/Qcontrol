import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ActionButton } from './ActionButton';
import { lookupQRCode } from '@/services/scanService';
import type { ScanResult } from '@/types/database';

interface ScannerProps {
  onResult: (result: ScanResult) => void;
  onClose: () => void;
}

export function Scanner({ onResult, onClose }: ScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleBarCodeScanned = async ({ type, data }: { type: string; data: string }) => {
    try {
      if (!scanning || data === lastScan) return;

      // Only accept QR codes
      if (type !== 'qr') return;

      // Accept Q-Controle QR codes (format: QCTRL-TYPE-ID-TIMESTAMP) or any valid QR code
      const trimmedData = data.trim();
      if (!trimmedData || trimmedData.length === 0) return;

      console.log('QR Code scanned:', trimmedData);

      setLastScan(data);
      setScanning(false);
      setError(null);

      try {
        const result = await lookupQRCode(trimmedData);
        onResult(result);
      } catch (error) {
        console.error('Scan error:', error);
        setError('Failed to lookup QR code');
        onResult({ type: 'not_found', code: trimmedData });
      }

      // Reset scanning after delay
      setTimeout(() => {
        setLastScan(null);
        setScanning(true);
        setError(null);
      }, 1500);
    } catch (error) {
      console.error('Barcode scan error:', error);
      setError('Camera scanning error');
    }
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading camera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>
            Enable camera access to scan QR codes
          </Text>
          <ActionButton
            title="Enable Camera"
            onPress={requestPermission}
            variant="primary"
            style={styles.permissionButton}
          />
          <ActionButton
            title="Cancel"
            onPress={onClose}
            variant="secondary"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={scanning ? handleBarCodeScanned : undefined}
      >
        <View style={styles.overlay}>
          <View style={styles.topOverlay} />
          <View style={styles.middleRow}>
            <View style={styles.sideOverlay} />
            <View style={styles.scanArea}>
              <View style={styles.corner} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
            </View>
            <View style={styles.sideOverlay} />
          </View>
          <View style={styles.bottomOverlay}>
            {error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : (
              <>
                <Text style={styles.instructions}>
                  Point camera at QR code
                </Text>
                <Text style={styles.subInstructions}>
                  The entire camera view can detect QR codes
                </Text>
              </>
            )}
            <ActionButton
              title="Cancel"
              onPress={onClose}
              variant="secondary"
              style={styles.cancelButton}
            />
          </View>
        </View>
      </CameraView>
    </View>
  );
}

const { width } = Dimensions.get('window');
const scanAreaSize = width * 0.7;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
  },
  topOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  middleRow: {
    flexDirection: 'row',
    height: scanAreaSize,
  },
  sideOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  scanArea: {
    width: scanAreaSize,
    height: scanAreaSize,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: '#16a34a',
    borderWidth: 3,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderTopWidth: 0,
    borderRightWidth: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderTopWidth: 0,
    borderLeftWidth: 0,
  },
  bottomOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  instructions: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
    fontWeight: '600',
  },
  subInstructions: {
    color: '#fbbf24',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    fontWeight: '500',
  },
  cancelButton: {
    width: 200,
  },
  loadingText: {
    color: 'white',
    fontSize: 18,
    textAlign: 'center',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'white',
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 16,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 32,
    textAlign: 'center',
  },
  permissionButton: {
    marginBottom: 16,
    width: 200,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    fontWeight: '600',
  },
});