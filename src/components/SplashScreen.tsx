import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Animated, Dimensions, Easing
} from 'react-native';

const { width: W, height: H } = Dimensions.get('window');

interface Props {
  onFinish: () => void;
}

// More bubbles with varied sizes for a richer cleaning feel
const BUBBLES = [
  { size: 22, bottom: H * 0.25, left: W * 0.12, duration: 1800, delay: 0,   opacity: 0.9 },
  { size: 14, bottom: H * 0.22, left: W * 0.28, duration: 2200, delay: 150, opacity: 0.6 },
  { size: 30, bottom: H * 0.20, left: W * 0.42, duration: 2000, delay: 80,  opacity: 0.5 },
  { size: 10, bottom: H * 0.26, left: W * 0.57, duration: 1600, delay: 250, opacity: 0.7 },
  { size: 18, bottom: H * 0.23, left: W * 0.70, duration: 2400, delay: 50,  opacity: 0.6 },
  { size: 12, bottom: H * 0.21, left: W * 0.83, duration: 1900, delay: 200, opacity: 0.5 },
  { size: 8,  bottom: H * 0.27, left: W * 0.92, duration: 1700, delay: 100, opacity: 0.4 },
];

export default function SplashScreen({ onFinish }: Props) {

  // ── ANIMATED VALUES ──
  const bgOpacity      = useRef(new Animated.Value(0)).current;
  const venuesWipe     = useRef(new Animated.Value(0)).current;
  const vWipe          = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineY       = useRef(new Animated.Value(12)).current;
  const mopX           = useRef(new Animated.Value(-W - 80)).current;
  const mopOpacity     = useRef(new Animated.Value(0)).current;

  // Shine sweep that follows the mop
  const shineX         = useRef(new Animated.Value(-W)).current;
  const shineOpacity   = useRef(new Animated.Value(0)).current;

  // Per-bubble animated values
  const bubbleYs       = useRef(BUBBLES.map(() => new Animated.Value(0))).current;
  const bubbleOpacity  = useRef(new Animated.Value(0)).current;

  // Sparkle
  const sparkleScale   = useRef(new Animated.Value(0)).current;
  const sparkleOpacity = useRef(new Animated.Value(0)).current;

  // Screen fade out
  const screenOpacity  = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([

      // 1. Background fades in
      Animated.timing(bgOpacity, {
        toValue: 1, duration: 350,
        useNativeDriver: true, easing: Easing.out(Easing.ease),
      }),

      Animated.delay(100),

      // 2. Mop sweeps slowly across — cleaning the surface
      Animated.parallel([
        Animated.timing(mopOpacity, {
          toValue: 1, duration: 150,
          useNativeDriver: true,
        }),
        // Slow mop sweep — takes its time
        Animated.timing(mopX, {
          toValue: W + 80, duration: 1100,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.quad),
        }),
        // Shine follows just behind the mop head
        Animated.sequence([
          Animated.delay(120),
          Animated.parallel([
            Animated.timing(shineOpacity, {
              toValue: 0.6, duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(shineX, {
              toValue: W + 80, duration: 1000,
              useNativeDriver: true,
              easing: Easing.inOut(Easing.quad),
            }),
          ]),
        ]),
      ]),

      Animated.delay(60),

      // 3. "Venues" wipes in
      Animated.timing(venuesWipe, {
        toValue: 1, duration: 500,
        useNativeDriver: false,
        easing: Easing.out(Easing.cubic),
      }),

      // 4. "V" wipes in
      Animated.timing(vWipe, {
        toValue: 1, duration: 320,
        useNativeDriver: false,
        easing: Easing.out(Easing.back(1.8)),
      }),

      Animated.delay(120),

      // 5. Tagline + bubbles + sparkle all rise together
      Animated.parallel([
        Animated.timing(taglineOpacity, {
          toValue: 1, duration: 450,
          useNativeDriver: true,
        }),
        Animated.timing(taglineY, {
          toValue: 0, duration: 450,
          useNativeDriver: true, easing: Easing.out(Easing.ease),
        }),
        Animated.timing(bubbleOpacity, {
          toValue: 1, duration: 350,
          useNativeDriver: true,
        }),
        // Each bubble floats up at its own pace
        ...BUBBLES.map((b, i) =>
          Animated.sequence([
            Animated.delay(b.delay),
            Animated.timing(bubbleYs[i], {
              toValue: -(55 + (b.size * 2)), duration: b.duration,
              useNativeDriver: true, easing: Easing.out(Easing.ease),
            }),
          ])
        ),
        Animated.spring(sparkleScale, {
          toValue: 1, useNativeDriver: true,
          tension: 70, friction: 5,
        }),
        Animated.timing(sparkleOpacity, {
          toValue: 1, duration: 300,
          useNativeDriver: true,
        }),
      ]),

      Animated.delay(900),

      // 6. Fade out
      Animated.timing(screenOpacity, {
        toValue: 0, duration: 550,
        useNativeDriver: true, easing: Easing.in(Easing.ease),
      }),

    ]).start(() => onFinish());
  }, []);

  const venuesWidth = venuesWipe.interpolate({
    inputRange: [0, 1], outputRange: ['0%', '100%'],
  });
  const vWidth = vWipe.interpolate({
    inputRange: [0, 1], outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View style={[s.screen, { opacity: screenOpacity }]}>

      {/* Background */}
      <Animated.View style={[s.bg, { opacity: bgOpacity }]}/>

      {/* Shine streak that follows the mop */}
      <Animated.View style={[s.shine, {
        opacity: shineOpacity,
        transform: [{ translateX: shineX }],
      }]}/>

      {/* Mop */}
      <Animated.View style={[s.mopBar, {
        opacity: mopOpacity,
        transform: [{ translateX: mopX }],
      }]}>
        <View style={s.mopHead}>
          {[-4,-3,-2,-1,0,1,2,3,4].map(i=>(
            <View key={i} style={[s.mopString,{
              marginLeft: i * 4,
              height: 32 + Math.abs(i) * 2,
              opacity: 1 - Math.abs(i) * 0.08,
              width: i === 0 ? 5 : 3,
            }]}/>
          ))}
        </View>
        {/* Mop head base bar */}
        <View style={s.mopBase}/>
        <View style={s.mopHandle}/>
      </Animated.View>

      {/* Main content */}
      <View style={s.content}>
        <View style={s.titleRow}>
          <View style={s.maskWrap}>
            <Animated.View style={[s.wipeReveal, { width: venuesWidth }]}>
              <Text style={s.titleVenues}>Venues</Text>
            </Animated.View>
          </View>
          <Text style={s.titleSpace}> </Text>
          <View style={s.maskWrap}>
            <Animated.View style={[s.wipeReveal, { width: vWidth }]}>
              <Text style={s.titleV}>V</Text>
            </Animated.View>
          </View>
        </View>

        <Animated.View style={{
          opacity: taglineOpacity,
          transform: [{ translateY: taglineY }],
          marginTop: 10,
        }}>
          <Text style={s.tagline}>Keep every venue spotless</Text>
        </Animated.View>

        <Animated.View style={[s.sparkle, {
          opacity: sparkleOpacity,
          transform: [{ scale: sparkleScale }],
        }]}/>
      </View>

      {/* Floating bubbles — varied sizes, staggered floats */}
      {BUBBLES.map((b, i) => (
        <Animated.View
          key={i}
          style={[s.bubble, {
            width: b.size,
            height: b.size,
            borderRadius: b.size / 2,
            bottom: b.bottom,
            left: b.left,
            opacity: Animated.multiply(bubbleOpacity, new Animated.Value(b.opacity)),
            transform: [{ translateY: bubbleYs[i] }],
          }]}
        />
      ))}

      {/* Bottom domain tag */}
      <Animated.Text style={[s.bottomTag, { opacity: taglineOpacity }]}>
        venuesv.com
      </Animated.Text>

    </Animated.View>
  );
}

const s = StyleSheet.create({
  screen: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#080a0e',
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#080a0e',
  },
  // Shine streak
  shine: {
    position: 'absolute',
    top: H * 0.38,
    left: -120,
    width: 80,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(0,200,150,0.35)',
    shadowColor: '#00c896',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  // Mop
  mopBar: {
    position: 'absolute',
    top: H * 0.39,
    left: -80,
    width: 80,
    alignItems: 'center',
    zIndex: 10,
  },
  mopHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 0,
  },
  mopString: {
    borderRadius: 2,
    backgroundColor: '#00c896',
  },
  mopBase: {
    width: 52,
    height: 5,
    backgroundColor: '#1a2a22',
    borderRadius: 3,
    marginBottom: 2,
  },
  mopHandle: {
    width: 7,
    height: 90,
    backgroundColor: '#8B6914',
    borderRadius: 4,
    transform: [{ rotate: '3deg' }],
  },
  // Title
  content: {
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    overflow: 'hidden',
  },
  maskWrap: {
    overflow: 'hidden',
  },
  wipeReveal: {
    overflow: 'hidden',
  },
  titleVenues: {
    fontSize: 52,
    fontWeight: '900',
    color: '#eef0f4',
    letterSpacing: -2,
  },
  titleSpace: {
    fontSize: 52,
    color: '#eef0f4',
  },
  titleV: {
    fontSize: 52,
    fontWeight: '900',
    color: '#00c896',
    letterSpacing: -2,
  },
  tagline: {
    fontSize: 14,
    color: '#6e7a8a',
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  sparkle: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00c896',
    marginTop: 22,
    shadowColor: '#00c896',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 14,
  },
  // Bubbles
  bubble: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(0,200,150,0.55)',
    backgroundColor: 'rgba(0,200,150,0.04)',
  },
  bottomTag: {
    position: 'absolute',
    bottom: 48,
    fontSize: 12,
    color: '#2a3a30',
    letterSpacing: 2,
    fontWeight: '500',
  },
});