import { ClosingCta } from "@/components/landing/ClosingCta";
import { Compatibility } from "@/components/landing/Compatibility";
import { DecisionMoment } from "@/components/landing/DecisionMoment";
import { Footer } from "@/components/landing/Footer";
import { Guarantees } from "@/components/landing/Guarantees";
import { Hero } from "@/components/landing/Hero";
import { HowItCloses } from "@/components/landing/HowItCloses";
import { MarketingNav } from "@/components/landing/MarketingNav";
import { ReceiptProof } from "@/components/landing/ReceiptProof";
import { ReferenceNumbers } from "@/components/landing/ReferenceNumbers";
import { TheRule } from "@/components/landing/TheRule";

/**
 * Landing page. Each section answers one question a field-service lead asks:
 *   Hero               What is it? (watch a real job close)
 *   Compatibility      Can it tell a receipt from proof of work?
 *   HowItCloses        What does it actually do, step by step?
 *   DecisionMoment     When will it bother my supervisors?
 *   TheRule            What is the AI allowed to decide?
 *   Guarantees         What can never go wrong?
 *   ReceiptProof       How do I trust the result later?
 *   ReferenceNumbers   What does a real job look like end to end?
 */
export default function LandingPage() {
  return (
    <>
      <MarketingNav />
      <main id="main">
        <Hero />
        <Compatibility />
        <HowItCloses />
        <DecisionMoment />
        <TheRule />
        <Guarantees />
        <ReceiptProof />
        <ReferenceNumbers />
        <ClosingCta />
      </main>
      <Footer />
    </>
  );
}
