import svgPaths from "./svg-bgfixn5yhu";

function Group() {
  return (
    <div className="absolute contents inset-0" data-name="Group">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 44 44">
        <g id="Layer_1">
          <path d="M44 0H0V44H44V0Z" fill="var(--fill-0, white)" id="Vector" />
          <path d={svgPaths.p312c5800} fill="url(#paint0_linear_1_236)" id="Vector_2" />
        </g>
        <defs>
          <linearGradient gradientUnits="userSpaceOnUse" id="paint0_linear_1_236" x1="6.6" x2="34.3059" y1="7.21312" y2="39.4047">
            <stop stopColor="#032D6B" />
            <stop offset="1" stopColor="#0849AC" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function StockxComLogo() {
  return (
    <div className="absolute left-[-0.5px] overflow-clip size-[44px] top-[0.5px]" data-name="stockx.com logo">
      <Group />
    </div>
  );
}

function Link() {
  return (
    <div className="-translate-y-1/2 absolute h-[44px] left-[352px] top-1/2 w-[191.91px]" data-name="Link">
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Bold',sans-serif] font-bold h-[28px] justify-center leading-[0] left-[56px] text-[#111827] text-[20px] top-[22px] w-[136.215px]">
        <p className="leading-[28px]">News2stock</p>
      </div>
      <div className="absolute bg-[rgba(85,155,247,0.15)] blur-[6px] inset-[0_147.91px_0_0] opacity-0 rounded-[9999px]" data-name="Overlay+Blur" />
      <StockxComLogo />
    </div>
  );
}

function LinkButtonSvg() {
  return (
    <div className="absolute left-[1390.53px] size-[20px] top-[28px]" data-name="Link → Button → SVG">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 20 20">
        <g clipPath="url(#clip0_1_232)" id="Link â Button â SVG">
          <path d={svgPaths.p39ddbc00} fill="var(--fill-0, #6B7280)" id="Vector" />
          <path d={svgPaths.p8e1980} fill="var(--fill-0, #6B7280)" id="Vector_2" />
        </g>
        <defs>
          <clipPath id="clip0_1_232">
            <rect fill="white" height="20" width="20" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function LinkButton() {
  return (
    <div className="absolute bg-[#0849ac] h-[44px] left-[1432.53px] overflow-clip rounded-[12px] top-[16px] w-[135.47px]" data-name="Link → Button">
      <div className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col font-['Montserrat:SemiBold',sans-serif] font-semibold h-[21px] justify-center leading-[0] left-[calc(50%+0.17px)] text-[16px] text-center text-white top-[calc(50%-0.5px)] w-[95.818px]">
        <p className="leading-[24px]">Bắt đầu</p>
      </div>
    </div>
  );
}

function Nav() {
  return (
    <div className="absolute h-[76px] left-[-0.5px] top-[0.5px] w-[1920px]" data-name="Nav">
      <Link />
      <div className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[21px] justify-center leading-[0] left-[calc(50%+233.5px)] text-[#4b5563] text-[16px] text-center top-1/2 w-[74px]">
        <p className="leading-[24px]">Phản hồi</p>
      </div>
      <div className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col font-['Montserrat:Bold',sans-serif] font-bold h-[21px] justify-center leading-[0] left-[calc(50%+322.5px)] text-[#4b5563] text-[16px] text-center top-[37px] w-[98px]">
        <p className="leading-[24px]">Nâng cấp</p>
      </div>
      <div className="-translate-y-1/2 absolute bg-[#e8f2ff] h-[24px] left-[1363.53px] top-1/2 w-px" data-name="Vertical Divider" />
      <LinkButtonSvg />
      <LinkButton />
    </div>
  );
}

function Container() {
  return (
    <div className="absolute inset-0 overflow-clip" data-name="Container">
      <div className="absolute bg-[rgba(232,240,255,0.5)] blur-[50px] right-[-192px] rounded-[9999px] size-[500px] top-[-120px]" data-name="Overlay+Blur" />
      <div className="absolute bg-[rgba(132,166,252,0.1)] blur-[40px] bottom-[-120px] left-[-192px] rounded-[9999px] size-[400px]" data-name="Overlay+Blur" />
    </div>
  );
}

function Svg() {
  return (
    <div className="-translate-y-1/2 absolute left-[32px] size-[18px] top-[calc(50%-28px)]" data-name="SVG">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 18 18">
        <g clipPath="url(#clip0_2_90)" id="SVG">
          <path d={svgPaths.p309ef400} fill="var(--fill-0, #2563EB)" id="Vector" />
        </g>
        <defs>
          <clipPath id="clip0_2_90">
            <rect fill="white" height="18" width="18" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Svg1() {
  return (
    <div className="-translate-y-1/2 absolute left-[32px] size-[18px] top-[calc(50%+12px)]" data-name="SVG">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 18 18">
        <g clipPath="url(#clip0_2_90)" id="SVG">
          <path d={svgPaths.p309ef400} fill="var(--fill-0, #2563EB)" id="Vector" />
        </g>
        <defs>
          <clipPath id="clip0_2_90">
            <rect fill="white" height="18" width="18" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Svg2() {
  return (
    <div className="-translate-y-1/2 absolute left-[32px] size-[18px] top-[calc(50%+52px)]" data-name="SVG">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 18 18">
        <g clipPath="url(#clip0_2_90)" id="SVG">
          <path d={svgPaths.p309ef400} fill="var(--fill-0, #2563EB)" id="Vector" />
        </g>
        <defs>
          <clipPath id="clip0_2_90">
            <rect fill="white" height="18" width="18" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function LinkButton1() {
  return (
    <div className="absolute bg-[#f3f4f6] h-[56px] left-[32px] right-[32px] rounded-[12px] top-[384px]" data-name="Link → Button">
      <div className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col font-['Montserrat:SemiBold',sans-serif] font-semibold h-[21px] justify-center leading-[0] left-1/2 text-[#111827] text-[16px] text-center top-1/2 w-[110px]">
        <p className="leading-[24px]">Bắt đầu ngay</p>
      </div>
    </div>
  );
}

function BackgroundBorder() {
  return (
    <div className="absolute bg-white border border-[#e8f2ff] border-solid h-[474px] left-[160px] right-[624px] rounded-[16px] top-[206px]" data-name="Background+Border">
      <div className="absolute bg-[rgba(255,255,255,0)] inset-[-1px] rounded-[16px] shadow-[0px_8px_40px_-12px_rgba(147,51,234,0.15)]" data-name="Overlay+Shadow" />
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Bold',sans-serif] font-bold h-[32px] justify-center leading-[0] left-[32px] text-[#111827] text-[24px] top-[47.5px] w-[56px]">
        <p className="leading-[32px]">Free</p>
      </div>
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[20px] justify-center leading-[0] left-[32px] text-[#6b7280] text-[14px] top-[82.5px] w-[200px]">
        <p className="leading-[20px]">Làm quen tính năng cơ bản</p>
      </div>
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Bold',sans-serif] font-bold h-[61px] justify-center leading-[0] left-[32px] text-[#111827] text-[40px] top-[140px] w-[73px]">
        <p className="leading-[48px]">0đ</p>
      </div>
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[22px] justify-center leading-[0] left-[94px] text-[#6b7280] text-[18px] top-[147.5px] w-[76px]">
        <p className="leading-[28px]">/Tháng</p>
      </div>
      <Svg />
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[24px] justify-center leading-[0] left-[62px] text-[#374151] text-[16px] top-[208.5px] w-[311px]">
        <p className="leading-[24px]">Tin tức tác động danh mục hàng ngày</p>
      </div>
      <Svg1 />
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[24px] justify-center leading-[0] left-[62px] text-[#374151] text-[16px] top-[248.5px] w-[159px]">
        <p className="leading-[24px]">Theo dõi 3 cổ phiếu</p>
      </div>
      <Svg2 />
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[24px] justify-center leading-[0] left-[62px] text-[#374151] text-[16px] top-[287.5px] w-[175px]">
        <p className="leading-[24px]">Thông báo qua Email</p>
      </div>
      <LinkButton1 />
    </div>
  );
}

function Svg3() {
  return (
    <div className="-translate-y-1/2 absolute left-[12px] size-[12px] top-1/2" data-name="SVG">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 12 12">
        <g clipPath="url(#clip0_2_81)" id="SVG">
          <path d={svgPaths.p16463f40} fill="var(--fill-0, #FCD34D)" id="Vector" />
        </g>
        <defs>
          <clipPath id="clip0_2_81">
            <rect fill="white" height="12" width="12" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function OverlayOverlayBlur() {
  return (
    <div className="absolute backdrop-blur-[2px] bg-[rgba(255,255,255,0.2)] h-[24px] left-[318.27px] rounded-[9999px] top-[24px] w-[89.73px]" data-name="Overlay+OverlayBlur">
      <Svg3 />
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:SemiBold',sans-serif] font-semibold h-[15px] justify-center leading-[0] left-[28.73px] text-[12px] text-white top-1/2 w-[49px]">
        <p className="leading-[16px]">Popular</p>
      </div>
    </div>
  );
}

function Svg4() {
  return (
    <div className="-translate-y-1/2 absolute left-[32px] size-[16px] top-[calc(50%-189px)]" data-name="SVG">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g clipPath="url(#clip0_2_87)" id="SVG">
          <path d={svgPaths.p35ec0300} fill="var(--fill-0, #FCD34D)" id="Vector" />
        </g>
        <defs>
          <clipPath id="clip0_2_87">
            <rect fill="white" height="16" width="16" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Svg5() {
  return (
    <div className="-translate-y-1/2 absolute left-[32px] size-[18px] top-[calc(50%-29px)]" data-name="SVG">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 18 18">
        <g clipPath="url(#clip0_2_84)" id="SVG">
          <path d={svgPaths.p309ef400} fill="var(--fill-0, #E8F2FF)" id="Vector" />
        </g>
        <defs>
          <clipPath id="clip0_2_84">
            <rect fill="white" height="18" width="18" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Svg6() {
  return (
    <div className="-translate-y-1/2 absolute left-[32px] size-[18px] top-[calc(50%+11px)]" data-name="SVG">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 18 18">
        <g clipPath="url(#clip0_2_84)" id="SVG">
          <path d={svgPaths.p309ef400} fill="var(--fill-0, #E8F2FF)" id="Vector" />
        </g>
        <defs>
          <clipPath id="clip0_2_84">
            <rect fill="white" height="18" width="18" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Svg7() {
  return (
    <div className="-translate-y-1/2 absolute left-[32px] size-[18px] top-[calc(50%+51px)]" data-name="SVG">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 18 18">
        <g clipPath="url(#clip0_2_84)" id="SVG">
          <path d={svgPaths.p309ef400} fill="var(--fill-0, #E8F2FF)" id="Vector" />
        </g>
        <defs>
          <clipPath id="clip0_2_84">
            <rect fill="white" height="18" width="18" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Svg8() {
  return (
    <div className="-translate-y-1/2 absolute left-[32px] size-[18px] top-[calc(50%+91px)]" data-name="SVG">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 18 18">
        <g clipPath="url(#clip0_2_84)" id="SVG">
          <path d={svgPaths.p309ef400} fill="var(--fill-0, #E8F2FF)" id="Vector" />
        </g>
        <defs>
          <clipPath id="clip0_2_84">
            <rect fill="white" height="18" width="18" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function LinkButton2() {
  return (
    <div className="absolute bg-white h-[70px] left-[32px] right-[32px] rounded-[12px] top-[372px]" data-name="Link → Button">
      <div className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col font-['Montserrat:SemiBold',sans-serif] font-semibold h-[20px] justify-center leading-[0] left-[calc(50%+0.24px)] text-[#0849ac] text-[16px] text-center top-[35.5px] w-[98.482px]">
        <p className="leading-[20px]">Thanh toán</p>
      </div>
    </div>
  );
}

function BackgroundShadow() {
  return (
    <div className="absolute h-[474px] left-[624px] overflow-clip right-[160px] rounded-[16px] shadow-[0px_20px_25px_-5px_rgba(92,136,246,0.3),0px_8px_10px_-6px_rgba(59,130,246,0.2)] top-[206px]" data-name="Background+Shadow" style={{ backgroundImage: "linear-gradient(132.345804deg, rgb(8, 73, 172) 0%, rgb(37, 99, 235) 50%, rgb(8, 73, 172) 100%)" }}>
      <div className="absolute bg-[rgba(255,255,255,0.1)] blur-[32px] right-0 rounded-[9999px] size-[160px] top-0" data-name="Overlay+Blur" />
      <div className="absolute bg-[rgba(132,166,252,0.1)] blur-[20px] bottom-0 left-0 rounded-[9999px] size-[128px]" data-name="Overlay+Blur" />
      <OverlayOverlayBlur />
      <Svg4 />
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Bold',sans-serif] font-bold h-[32px] justify-center leading-[0] left-[56px] text-[24px] text-white top-[48.5px] w-[46px]">
        <p className="leading-[32px]">Pro</p>
      </div>
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[20px] justify-center leading-[0] left-[32px] text-[#e8f2ff] text-[14px] top-[82.5px] w-[181px]">
        <p className="leading-[20px]">Mở khoá tất cả tiềm năng</p>
      </div>
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Bold',sans-serif] font-bold h-[61px] justify-center leading-[0] left-[32px] text-[40px] text-white top-[139px] w-[194px]">
        <p className="leading-[48px]">50.000đ</p>
      </div>
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[22px] justify-center leading-[0] left-[226px] text-[#e8f2ff] text-[18px] top-[146.5px] w-[66.802px]">
        <p className="leading-[28px]">/Tháng</p>
      </div>
      <Svg5 />
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[24px] justify-center leading-[0] left-[62px] text-[16px] text-[rgba(255,255,255,0.9)] top-[208.5px] w-[216px]">
        <p className="leading-[24px]">{`Tất cả tính năng miễn phí `}</p>
      </div>
      <Svg6 />
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[24px] justify-center leading-[0] left-[62px] text-[16px] text-[rgba(255,255,255,0.9)] top-[248px] w-[275.577px]">
        <p className="leading-[24px]">Tạo Prompt phân tích với AI</p>
      </div>
      <Svg7 />
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[24px] justify-center leading-[0] left-[62px] text-[16px] text-[rgba(255,255,255,0.9)] top-[288.5px] w-[203px]">
        <p className="leading-[24px]">Theo dõi không giới hạn</p>
      </div>
      <Svg8 />
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[24px] justify-center leading-[0] left-[62px] text-[16px] text-[rgba(255,255,255,0.9)] top-[328.5px] w-[276px]">
        <p className="leading-[24px]">Thay đổi tần suất nhận thông báo</p>
      </div>
      <LinkButton2 />
    </div>
  );
}

function Section() {
  return (
    <div className="-translate-y-1/2 absolute h-[748px] left-[352px] right-[352px] top-[calc(50%-18.5px)]" data-name="Section">
      <div className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col font-['Montserrat:SemiBold',sans-serif] font-semibold h-[20px] justify-center leading-[0] left-[calc(50%+0.14px)] text-[#0849ac] text-[14px] text-center top-[12px] tracking-[0.7px] uppercase w-[68.605px]">
        <p className="leading-[20px]">Pricing</p>
      </div>
      <div className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col font-['Montserrat:Bold',sans-serif] font-bold h-[60px] justify-center leading-[0] left-[calc(50%+4px)] text-[#111827] text-[50px] text-center top-[68.5px] w-[506px]">
        <p className="leading-[60px]">Nâng cấp tiếp theo</p>
      </div>
      <div className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[28px] justify-center leading-[0] left-[calc(50%+0.15px)] text-[#4b5563] text-[20px] text-center top-[128px] w-[513.86px]">
        <p className="leading-[28px] whitespace-pre-wrap">{`Chọn gói phù hợp nhất với  bạn`}</p>
      </div>
      <BackgroundBorder />
      <BackgroundShadow />
      <div className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[20px] justify-center leading-[0] left-[calc(50%+0.16px)] text-[#6b7280] text-[14px] text-center top-[738px] w-[354.538px]">
        <p className="leading-[20px]">Không mất phí để bắt đầu</p>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <div className="absolute bg-white border-[rgba(59,130,246,0.2)] border-solid border-t h-[69px] left-0 right-0 top-[1131px]" data-name="Footer">
      <div className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[18px] justify-center leading-[0] left-[calc(50%+0.15px)] text-[#6b7280] text-[14px] text-center top-[34px] w-[301.647px]">
        <p className="leading-[20px]">{`© 2026 `}</p>
      </div>
    </div>
  );
}

function Background() {
  return (
    <div className="absolute bg-gradient-to-b from-white h-[1200px] left-0 right-0 to-white top-0 via-1/2 via-[rgba(245,248,255,0.3)]" data-name="Background">
      <Container />
      <Section />
      <Footer />
    </div>
  );
}

export default function Component1920WLight() {
  return (
    <div className="bg-white relative size-full" data-name="1920w light">
      <Nav />
      <Background />
    </div>
  );
}