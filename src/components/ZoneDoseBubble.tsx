import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

export interface NextZoneHint {
  direction: string;
  distanceM: number;
  dose: number | null;
  fillColor: string;
  settingLabel: string | null;
}

export interface SpeedGuidance {
  targetKmh: number;
  currentKmh: number;
  direction: 'ok' | 'accelerate' | 'decelerate';
  deltaKmh: number;
  color: string;
}

export interface ZoneBubbleInfo {
  fillColor: string;
  dose: number | null;
  unite: string;
  settingLabel: string | null;
  speedGuidance: SpeedGuidance | null;
  nextZone: NextZoneHint | null;
}

interface Props {
  info: ZoneBubbleInfo | null;
  topOffset: number;
}

const BLINK_THRESHOLD = 5; // mètres

export function ZoneDoseBubble({ info, topOffset }: Props) {
  const blinkAnim = useRef(new Animated.Value(1)).current;
  const animRef   = useRef<Animated.CompositeAnimation | null>(null);

  // Lock-in : s'arme à ≤5 m, ne se désarme que quand la dose change
  // ou quand aucune zone à dose différente n'est plus détectée (>10 m).
  const [shouldBlink, setShouldBlink] = useState(false);
  const lockRef = useRef<{
    armed: boolean;
    doseAtArm: number | null;
    nextDose: number | null;
  }>({ armed: false, doseAtArm: null, nextDose: null });

  useEffect(() => {
    const lock = lockRef.current;

    if (info == null) {
      if (lock.armed) {
        lock.armed = false; lock.doseAtArm = null; lock.nextDose = null;
        setShouldBlink(false);
      }
      return;
    }

    const atThreshold = info.nextZone != null && info.nextZone.distanceM <= BLINK_THRESHOLD;

    if (!lock.armed && atThreshold) {
      lock.armed     = true;
      lock.doseAtArm = info.dose;
      lock.nextDose  = info.nextZone!.dose;
      setShouldBlink(true);
      return;
    }

    if (lock.armed) {
      const doseChanged    = info.dose !== lock.doseAtArm;
      const noNearbyChange = info.nextZone == null;
      if (doseChanged || noNearbyChange) {
        lock.armed = false; lock.doseAtArm = null; lock.nextDose = null;
        setShouldBlink(false);
      }
    }
  }, [info]);

  useEffect(() => {
    if (shouldBlink) {
      animRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(blinkAnim, { toValue: 0.1, duration: 300, useNativeDriver: true }),
          Animated.timing(blinkAnim, { toValue: 1,   duration: 300, useNativeDriver: true }),
        ]),
      );
      animRef.current.start();
    } else {
      animRef.current?.stop();
      animRef.current = null;
      blinkAnim.setValue(1);
    }
    return () => { animRef.current?.stop(); };
  }, [shouldBlink, blinkAnim]);

  if (!info) return null;

  const doseLabel = info.dose != null ? `${info.dose} ${info.unite}` : '—';
  const hasCalibration = info.settingLabel != null;

  const trendArrow = (() => {
    if (!shouldBlink) return null;
    const cur  = lockRef.current.doseAtArm;
    const next = lockRef.current.nextDose;
    if (cur == null || next == null) return null;
    if (next > cur) return { symbol: '▲', color: '#FF6B35' };
    if (next < cur) return { symbol: '▼', color: '#4FC3F7' };
    return null;
  })();

  return (
    <View style={[styles.wrapper, { top: topOffset }]} pointerEvents="none">

      {/* Pastille principale */}
      <Animated.View style={[styles.bubble, { opacity: blinkAnim }]}>
        <View style={[styles.colorDot, { backgroundColor: info.fillColor }]} />
        <View style={styles.mainTextBlock}>
          {hasCalibration ? (
            <>
              <Text style={styles.settingText}>{info.settingLabel}</Text>
              <Text style={styles.doseSubText}>{doseLabel}</Text>
            </>
          ) : (
            <Text style={styles.doseText}>{doseLabel}</Text>
          )}
          {info.speedGuidance && (
            <View style={styles.speedRow}>
              <Text style={[styles.speedCurrent, { color: info.speedGuidance.color }]}>
                {info.speedGuidance.currentKmh.toFixed(1)} km/h
              </Text>
              <Text style={[styles.speedHint, { color: info.speedGuidance.color }]}>
                {info.speedGuidance.direction === 'ok'
                  ? '✓'
                  : info.speedGuidance.direction === 'decelerate'
                  ? '↓ Ralentissez'
                  : '↑ Accélérez'}
              </Text>
            </View>
          )}
        </View>
        {trendArrow && (
          <Text style={[styles.trendArrow, { color: trendArrow.color }]}>
            {trendArrow.symbol}
          </Text>
        )}
      </Animated.View>

      {/* Indicateur zone suivante < 10 m */}
      {info.nextZone && (
        <View style={styles.nextBubble}>
          <Text style={styles.nextArrow}>→ {info.nextZone.direction}</Text>
          <View style={[styles.nextDot, { backgroundColor: info.nextZone.fillColor }]} />
          <Text style={styles.nextText}>
            {Math.round(info.nextZone.distanceM)} m{'  '}
            {info.nextZone.settingLabel
              ? info.nextZone.settingLabel
              : info.nextZone.dose != null
                ? `${info.nextZone.dose} ${info.unite}`
                : '—'}
          </Text>
        </View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 6,
    zIndex: 100,
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(10,10,10,0.88)',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 8,
  },
  colorDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2.5,
    borderColor: '#fff',
  },
  mainTextBlock: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  settingText: {
    fontSize: 30,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  doseSubText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.65)',
    marginTop: -2,
  },
  speedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  speedCurrent: {
    fontSize: 15,
    fontWeight: '800',
  },
  speedHint: {
    fontSize: 13,
    fontWeight: '600',
  },
  doseText: {
    fontSize: 30,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  trendArrow: {
    fontSize: 22,
    fontWeight: '900',
  },
  nextBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(10,10,10,0.75)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  nextArrow: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFD700',
  },
  nextDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  nextText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F0F0F0',
  },
});
