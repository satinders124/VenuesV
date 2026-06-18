import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Animated, Dimensions, Easing
} from 'react-native';

const { width: W, height: H } = Dimensions.get('window');

interface Props {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: Props) {

  // ── ANIMATED VALUES ──
  const bgOpacity      = useRef(new Animated.Value(0)).current;

  // Wipe reveal for "Venues"
  const venuesWipe     = useRef(new Animated.Value(0)).current;
  // Wipe reveal for "V"
  const vWipe          = useRef(new Animated.Value(0)).current;

  // Tagline
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineY       = useRef(new Animated.Value(10)).current;

  // Mop sweep line
  const mopX           = useRef(new Animated.Value(-W)).current;
  const mopOpacity     = useRef(new Animated.Value(0)).current;

  // Bubble dots
  const bubble1Y       = useRef(new Animated.Value(0)).current;
  const bubble2Y       = useRef(new Animated.Value(0)).current;
  const bubble3Y       = useRef(new Animated.Value(0)).current;
  const bubbleOpacity  = useRef(new Animated.Value(0)).current;

  // Sparkle
  const sparkleScale   = useRef(new Animated.Value(0)).current;
  const sparkleOpacity = useRef(new Animated.Value(0)).current;

  // Final fade out
  const screenOpacity  = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([

      // 1. Background fades in
      Animated.timing(bgOpacity, {
        toValue: 1, duration: 300,
        useNativeDriver: true, easing: Easing.out(Easing.ease),
      }),

      // 2. Mop sweeps across — cleaning the surface
      Animated.parallel([
        Animated.timing(mopOpacity, {
          toValue: 1, duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(mopX, {
          toValue: W + 60, duration: 550,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
      ]),

      Animated.delay(50),

      // 3. "Venues" text wipes in left to right
      Animated.timing(venuesWipe, {
        toValue: 1, duration: 450,
        useNativeDriver: false,
        easing: Easing.out(Easing.cubic),
      }),

      // 4. "V" wipes in
      Animated.timing(vWipe, {
        toValue: 1, duration: 300,
        useNativeDriver: false,
        easing: Easing.out(Easing.back(1.5)),
      }),

      Animated.delay(100),

      // 5. Tagline + bubbles + sparkle appear together
      Animated.parallel([
        Animated.timing(taglineOpacity, {
          toValue: 1, duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(taglineY, {
          toValue: 0, duration: 400,
          useNativeDriver: true, easing: Easing.out(Easing.ease),
        }),
        Animated.timing(bubbleOpacity, {
          toValue: 1, duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(bubble1Y, {
          toValue: -60, duration: 1200,
          useNativeDriver: true, easing: Easing.out(Easing.ease),
        }),
        Animated.timing(bubble2Y, {
          toValue: -80, duration: 1400,
          useNativeDriver: true, easing: Easing.out(Easing.ease),
        }),
        Animated.timing(bubble3Y, {
          toValue: -50, duration: 1000,
          useNativeDriver: true, easing: Easing.out(Easing.ease),
        }),
        Animated.spring(sparkleScale, {
          toValue: 1, useNativeDriver: true,
          tension: 80, friction: 5,
        }),
        Animated.timing(sparkleOpacity, {
          toValue: 1, duration: 300,
          useNativeDriver: true,
        }),
      ]),

      Animated.delay(800),

      // 6. Fade out whole screen
      Animated.timing(screenOpacity, {
        toValue: 0, duration: 500,
        useNativeDriver: true, easing: Easing.in(Easing.ease),
      }),

    ]).start(() => onFinish());
  }, []);

  // Wipe widths
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

      {/* Mop sweep bar */}
      <Animated.View style={[s.mopBar, {
        opacity: mopOpacity,
        transform: [{ translateX: mopX }],
      }]}>
        <View style={s.mopHead}>
          {[-3,-2,-1,0,1,2,3].map(i=>(
            <View key={i} style={[s.mopString,{
              marginLeft: i*5,
              height: 28+Math.abs(i)*2,
              opacity: 1-Math.abs(i)*0.1,
            }]}/>
          ))}
        </View>
        <View style={s.mopHandle}/>
      </Animated.View>

      {/* Main content */}
      <View style={s.content}>

        {/* "Venues V" with wipe reveal */}
        <View style={s.titleRow}>

          {/* "Venues" masked wipe */}
          <View style={s.maskWrap}>
            <Animated.View style={[s.wipeReveal, { width: venuesWidth }]}>
              <Text style={s.titleVenues}>Venues</Text>
            </Animated.View>
          </View>

          <Text style={s.titleSpace}> </Text>

          {/* "V" masked wipe */}
          <View style={s.maskWrap}>
            <Animated.View style={[s.wipeReveal, { width: vWidth }]}>
              <Text style={s.titleV}>V</Text>
            </Animated.View>
          </View>

        </View>

        {/* Tagline */}
        <Animated.View style={{
          opacity: taglineOpacity,
          transform: [{ translateY: taglineY }],
          marginTop: 10,
        }}>
          <Text style={s.tagline}>Keep every venue spotless</Text>
        </Animated.View>

        {/* Sparkle dot */}
        <Animated.View style={[s.sparkle, {
          opacity: sparkleOpacity,
          transform: [{ scale: sparkleScale }],
        }]}/>

      </View>

      {/* Floating bubbles */}
      <Animated.View style={[s.bubble, s.bubble1, {
        opacity: bubbleOpacity,
        transform: [{ translateY: bubble1Y }],
      }]}/>
      <Animated.View style={[s.bubble, s.bubble2, {
        opacity: Animated.multiply(bubbleOpacity, new Animated.Value(0.7)),
        transform: [{ translateY: bubble2Y }],
      }]}/>
      <Animated.View style={[s.bubble, s.bubble3, {
        opacity: Animated.multiply(bubbleOpacity, new Animated.Value(0.5)),
        transform: [{ translateY: bubble3Y }],
      }]}/>

      {/* Bottom tagline */}
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
  // Mop sweep
  mopBar: {
    position: 'absolute',
    top: H * 0.42,
    left: -60,
    width: 60,
    alignItems: 'center',
    zIndex: 10,
  },
  mopHandle: {
    width: 8,
    height: 80,
    backgroundColor: '#8B6914',
    borderRadius: 4,
  },
  mopHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 2,
  },
  mopString: {
    width: 4,
    borderRadius: 2,
    backgroundColor: '#00c896',
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
    marginTop: 20,
    shadowColor: '#00c896',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 12,
  },
  // Bubbles
  bubble: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(0,200,150,0.5)',
  },
  bubble1: {
    width: 22, height: 22,
    bottom: H * 0.25,
    left: W * 0.25,
  },
  bubble2: {
    width: 14, height: 14,
    bottom: H * 0.28,
    left: W * 0.6,
  },
  bubble3: {
    width: 18, height: 18,
    bottom: H * 0.22,
    left: W * 0.45,
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