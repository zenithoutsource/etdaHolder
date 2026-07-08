import {
  Image,
  ScrollView,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";

import { AppButton } from "./AppButton";

const facePrepareImage =
  require("../../assets/images/face_id.png") as ImageSourcePropType;
const lightBulbImage =
  require("../../assets/images/light_bulb.png") as ImageSourcePropType;
const pokerFaceImage =
  require("../../assets/images/poker_face.png") as ImageSourcePropType;
const eyeImage = require("../../assets/images/eye_2.png") as ImageSourcePropType;
const faceMaskImage =
  require("../../assets/images/face_mask.png") as ImageSourcePropType;

type Props = {
  onScan: () => void;
};

export function FacePreparePanel({ onScan }: Props) {
  return (
    <View className="flex-1 bg-surface">
      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="items-center px-5 pb-10 pt-5">
          <Text className="mb-5 text-[22px] font-extrabold text-navy-deep">
            สแกนใบหน้า
          </Text>

          <Image
            source={facePrepareImage}
            className="h-40 w-40 rounded-full"
            resizeMode="cover"
          />

          <Text className="mt-5 text-[18px] font-extrabold text-navy-deep">
            เตรียมสแกนใบหน้า
          </Text>
          <Text className="mt-2 text-center text-[13px] leading-6 text-gray500">
            สำหรับใช้ในการยืนยันตัวตน{"\n"}เพื่อความปลอดภัยของคุณ
          </Text>

          <View className="mt-6 w-full gap-5 border-t border-gray-light pt-5">
            <View className="flex-row items-start gap-3.5">
              <Image
                source={lightBulbImage}
                className="h-10 w-10"
                resizeMode="contain"
              />
              <Text className="flex-1 pt-2 text-[13px] leading-6 text-navy-deep">
                อยู่ในที่ที่มีแสงเหมาะสม ไม่สว่างหรือมืดเกินไป
              </Text>
            </View>

            <View className="flex-row items-start gap-3.5">
              <Image
                source={pokerFaceImage}
                className="h-10 w-10"
                resizeMode="contain"
              />
              <Text className="flex-1 pt-2 text-[13px] leading-6 text-navy-deep">
                ขยับใบหน้าให้อยู่ภายในกรอบ{" "}
                <Text className="font-bold text-green-dark">
                  จนกรอบเป็นสีเขียว
                </Text>
              </Text>
            </View>

            <View className="flex-row items-start gap-3.5">
              <Image
                source={eyeImage}
                className="h-10 w-10"
                resizeMode="contain"
              />
              <Text className="flex-1 pt-2 text-[13px] leading-6 text-navy-deep">
                พยายามลืมตาให้กว้าง
              </Text>
            </View>

            <View className="flex-row items-start gap-3.5">
              <Image
                source={faceMaskImage}
                className="h-10 w-10"
                resizeMode="contain"
              />
              <Text className="flex-1 pt-2 text-[13px] leading-6 text-navy-deep">
                <Text className="font-bold">ต้องเห็น ตา จมูก ปาก </Text>
                ชัดเจน ไม่สวมแว่น หน้ากากอนามัยและไม่ใส่หมวก
              </Text>
            </View>
          </View>

          <AppButton
            variant="solid-block"
            label="สแกนใบหน้า"
            onPress={onScan}
            className="mt-9 h-[54px] w-[85%] bg-navy-royal"
            textClassName="text-[17px] font-extrabold"
          />
        </View>
      </ScrollView>
    </View>
  );
}
