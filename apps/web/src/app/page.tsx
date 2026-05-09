import { HomeAuthBridge } from "./home-auth-bridge";
import { HomeLanding } from "./home-landing";

export default function Home() {
  return (
    <>
      <HomeLanding />
      <HomeAuthBridge />
    </>
  );
}
