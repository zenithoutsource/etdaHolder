import { useEffect } from "react";
import { Image, Text, View, type ImageSourcePropType } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

const portraitImage =
  require("../../assets/images/user_profile.png") as ImageSourcePropType;

const SCAN_DURATION_MS = 1800;
const RING_SIZE = 220;
const RING_STROKE = 4;
const RING_ROTATION_MS = 1400;

type Props = {
  onComplete: () => void;
};

function ScanRing({
  direction,
  color,
  testID,
}: {
  direction: 1 | -1;
  color: string;
  testID: string;
}) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(rotation);
    rotation.value = 0;
    rotation.value = withRepeat(
      withTiming(direction * 360, {
        duration: RING_ROTATION_MS,
        easing: Easing.linear,
        reduceMotion: ReduceMotion.Never,
      }),
      -1,
      false,
      undefined,
      ReduceMotion.Never,
    );

    return () => cancelAnimation(rotation);
  }, [direction, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View
      testID={testID}
      style={[
        {
          position: "absolute",
          width: RING_SIZE,
          height: RING_SIZE,
          borderRadius: RING_SIZE / 2,
          borderWidth: RING_STROKE,
          borderColor: "transparent",
          borderTopColor: color,
          borderRightColor: color,
        },
        animatedStyle,
      ]}
    />
  );
}

export function FaceScanPanel({ onComplete }: Props) {
  useEffect(() => {
    const timer = setTimeout(onComplete, SCAN_DURATION_MS);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <View className="flex-1 items-center bg-[#eef1f4] px-6 pt-[140px]">
      <View
        style={{ width: RING_SIZE, height: RING_SIZE }}
        className="items-center justify-center"
      >
        <ScanRing direction={1} color="#18a05d" testID="face-scan-ring-outer" />
        <ScanRing direction={-1} color="#9adfc1" testID="face-scan-ring-inner" />
        <View className="h-[164px] w-[164px] items-center justify-center rounded-full">
          <Image
            source={portraitImage}
            style={{ width: 200, height: 200, borderRadius: 100 }}
            resizeMode="cover"
          />
        </View>
      </View>
      <Text className="mt-7 text-center text-[16px] font-extrabold text-[#071f5f]">
        กำลังสแกนใบหน้า...
      </Text>
      <Text className="mt-2 text-center text-[13px] leading-5 text-[#6b7280]">
        กรุณาวางใบหน้าให้อยู่ในกรอบและกระพริบตา
      </Text>
    </View>
  );
}
