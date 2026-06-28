import { useState } from "react";
import { useTheme } from "../use-theme";
import { Navbar } from "../components/navbar";
import { Hero } from "../components/hero";
import { TrustStrip, HowItWorks } from "../components/sections-a";
import { Features, TemplateAgents } from "../components/sections-b";
import { Personas, Comparison } from "../components/sections-c";
import { Pricing, Testimonials, FAQ } from "../components/sections-d";
import { FinalCTA, Footer } from "../components/sections-e";
import { DemoModal } from "../components/demo-modal";

export function LandingPage() {
  const { theme, toggleTheme } = useTheme();
  const [demoOpen, setDemoOpen] = useState(false);

  return (
    <div
      className={theme === "dark" ? "wb-dark" : "wb-light"}
      style={{ background: "var(--wb-canvas)", color: "var(--wb-text)", minHeight: "100vh", fontFamily: "Montserrat, sans-serif" }}
    >
      <Navbar
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenDemo={() => setDemoOpen(true)}
      />
      <main>
        {/* 1. Hero - giới thiệu sản phẩm + 3D dashboard */}
        <Hero onOpenDemo={() => setDemoOpen(true)} />

        {/* 2. Điểm nổi bật - 4 stat card thuyết phục ngay lập tức */}
        <TrustStrip />

        {/* 3. Cách hoạt động - 3 bước + Agent Studio 3D */}
        <HowItWorks />

        {/* 4. Tính năng - bento grid, Action Hub trung tâm */}
        <Features />

        {/* 5. Template Agents - bắt đầu nhanh */}
        <TemplateAgents />

        {/* 6. So sánh - khác biệt vs chatbot thường */}
        <Comparison />

        {/* 7. Dành cho ai - 3 persona */}
        <Personas />

        {/* 8. Bảng giá - 3 gói, toggle monthly/yearly */}
        <Pricing onOpenDemo={() => setDemoOpen(true)} />

        {/* 9. Testimonials - social proof */}
        <Testimonials />

        {/* 10. FAQ */}
        <FAQ />

        {/* 11. CTA cuối */}
        <FinalCTA onOpenDemo={() => setDemoOpen(true)} />
      </main>
      <Footer theme={theme} />
      <DemoModal open={demoOpen} onClose={() => setDemoOpen(false)} theme={theme} />
    </div>
  );
}
