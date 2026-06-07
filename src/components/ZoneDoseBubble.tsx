import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

export interface NextZoneHint {
  direction: string;
  distanceM: number;
  dose: number | null;
  fillColor: string;
}

export interface ZoneBubbleInfo {
  fillColor: string;
  dose: number | null;
  unite: string;
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

  const shouldBlink =
    info?.nextZone != null && info.nextZone.distanceM <= BLINK_THRESHOLD;

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

  return (
    <View style={[styles.wrapper, { top: topOffset }]} pointerEvents="none">

      {/* Pastille principale — dose courante */}
      <Animated.View style={[styles.bubble, { opacity: blinkAnim }]}>
        <View style={[styles.colorDot, { backgroundColor: info.fillColor }]} />
        <Text style={styles.doseText}>{doseLabel}</Text>
      </Animated.View>

      {/* Indicateur zone suivante < 10 m */}
      {info.nextZone && (
        <View style={styles.nextBubble}>
          <Text style={styles.nextArrow}>→ {info.nextZone.direction}</Text>
          <View style={[styles.nextDot, { backgroundColor: info.nextZone.fillColor }]} />
          <Text style={styles.nextText}>
            {Math.round(info.nextZone.distanceM)} m{'  '}
            {info.nextZone.dose != null ? `${info.nextZone.dose} ${info.unite}` : '—'}
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
  doseText: {
    fontSize: 30,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
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
