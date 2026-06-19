import svgPaths from "./svg-vhxiijub25";
import imgWealthsimple from "figma:asset/0111693d96cb756f6bbe9d38bbb84ff3b823dc29.png";
import imgRbc from "figma:asset/c824e8723e2ceb9d9fcff6b163042cad7132be01.png";
import imgCibc from "figma:asset/1917b71a2595ed579da0d543fbaea8eaf6ff3ed4.png";

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
      <div className="absolute bg-[rgba(59,130,246,0.2)] blur-[6px] inset-[0_147.91px_0_0] opacity-0 rounded-[9999px]" data-name="Overlay+Blur" />
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
    <div className="absolute h-[76px] left-0 top-0 w-[1920px]" data-name="Nav">
      <Link />
      <div className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[21px] justify-center leading-[0] left-[calc(50%+233.5px)] text-[#4b5563] text-[16px] text-center top-1/2 w-[74px]">
        <p className="leading-[24px]">Phản hồi</p>
      </div>
      <div className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col font-['Montserrat:Bold',sans-serif] font-bold h-[21px] justify-center leading-[0] left-[calc(50%+322.5px)] text-[#4b5563] text-[16px] text-center top-[37px] w-[98px]">
        <p className="leading-[24px]">Nâng cấp</p>
      </div>
      <div className="-translate-y-1/2 absolute bg-[#90bcf5] h-[24px] left-[1363.53px] top-1/2 w-px" data-name="Vertical Divider" />
      <LinkButtonSvg />
      <LinkButton />
    </div>
  );
}

function Container() {
  return <div className="absolute inset-[0_0_2406.89px_0]" data-name="Container" />;
}

function BackgroundBorderShadow() {
  return (
    <div className="-translate-x-1/2 absolute bg-[#e8f2ff] border border-[rgba(132,166,252,0.1)] border-solid h-[42px] left-[calc(50%-1px)] rounded-[9999px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] top-[112.5px] w-[281px]" data-name="Background+Border+Shadow">
      <div className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[20px] justify-center leading-[0] left-[calc(50%+14px)] text-[#032d6b] text-[12px] text-center top-[20px] w-[231px]">
        <p className="leading-[20px]">Tin tức cá nhân hoá cho từng tài sản</p>
      </div>
      <div className="absolute bg-[#032d6b] inset-[16px_252px_16px_20px] opacity-75 rounded-[9999px]" data-name="Background" />
      <div className="absolute bg-[#0849ac] left-[20px] rounded-[9999px] size-[8px] top-[16px]" data-name="Background" />
    </div>
  );
}

function Svg() {
  return (
    <div className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%+81.5px)] size-[18px] top-1/2" data-name="SVG">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 18 18">
        <g id="SVG">
          <path clipRule="evenodd" d={svgPaths.p2c3d3e0} fill="var(--fill-0, white)" fillRule="evenodd" id="Vector" />
        </g>
      </svg>
    </div>
  );
}

function LinkButton1() {
  return (
    <div className="absolute bg-gradient-to-r from-[#0849ac] h-[60px] left-[838.5px] rounded-[12px] to-[#2563eb] top-[502.5px] w-[244.98px]" data-name="Link → Button">
      <div className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col font-['Montserrat:SemiBold',sans-serif] font-semibold h-[22px] justify-center leading-[0] left-[calc(50%-21.66px)] text-[18px] text-center text-white top-[calc(50%-0.5px)] w-[164px]">
        <p className="leading-[28px]">Bắt đầu miễn phí</p>
      </div>
      <Svg />
    </div>
  );
}

function Svg1() {
  return (
    <div className="-translate-y-1/2 absolute left-[865.88px] size-[14px] top-[calc(50%-196.45px)]" data-name="SVG">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 14 14">
        <g clipPath="url(#clip0_1_269)" id="SVG">
          <path d={svgPaths.p1ccd2d00} fill="var(--fill-0, #032D6B)" id="Vector" />
        </g>
        <defs>
          <clipPath id="clip0_1_269">
            <rect fill="white" height="14" width="14" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Group1() {
  return (
    <div className="absolute contents left-[4.5px] top-[6.5px]">
      <div className="absolute bg-[#2563eb] h-[61.769px] left-[4.5px] rounded-[10px] top-[6.5px] w-[756px]" />
      <div className="absolute bg-[#2563eb] h-[31.308px] left-[4.5px] top-[52.19px] w-[756px]" />
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:SemiBold',sans-serif] font-semibold justify-center leading-[0] left-[156.5px] text-[#eef3ff] text-[16px] top-[46.5px] whitespace-nowrap">
        <p className="leading-[26px]">News2stock - Tin tức tác động đến tài sản của bạn hàng ngày</p>
      </div>
    </div>
  );
}

function Group2() {
  return (
    <div className="absolute contents left-[4.5px] top-[6.5px]">
      <div className="absolute bg-[#eef3ff] h-[831px] left-[4.5px] rounded-[10px] top-[6.5px] w-[756px]" />
      <Group1 />
      <div className="absolute bg-white h-[61px] left-[141.5px] rounded-[10px] top-[113.5px] w-[481px]" />
      <div className="absolute bg-white h-[195px] left-[141.5px] rounded-[10px] top-[187.5px] w-[481px]" />
      <div className="absolute bg-white h-[190px] left-[141.5px] rounded-[10px] top-[404.5px] w-[481px]" />
      <div className="absolute bg-white h-[154px] left-[141.5px] rounded-[10px] top-[613.5px] w-[481px]" />
    </div>
  );
}

function Group3() {
  return (
    <div className="absolute contents left-[4.5px] top-[6.5px]">
      <Group2 />
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[18px] justify-center leading-[0] left-[351.5px] text-[#6b7280] text-[14px] top-[814.5px] w-[61px]">
        <p className="leading-[20px]">{`© 2026 `}</p>
      </div>
      <div className="absolute h-0 left-[141.5px] top-[790.5px] w-[481px]">
        <div className="absolute inset-[-1px_0_0_0]">
          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 481 1">
            <line id="Line 1" stroke="var(--stroke-0, #6B7280)" x2="481" y1="0.5" y2="0.5" />
          </svg>
        </div>
      </div>
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[26px] justify-center leading-[0] left-[161.5px] text-[14px] text-black top-[144.5px] w-[442px]">
        <p className="leading-[20px]">Chào buổi sáng! Dưới đây là các cập nhật quan trọng cho danh mục đầu tư của bạn:</p>
      </div>
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[173px] justify-center leading-[0] left-[161.5px] text-[14px] text-black top-[286px] w-[442px]">
        <p className="font-['Montserrat:Bold',sans-serif] font-bold leading-[20px] mb-0">VNM - 100 cổ phiếu</p>
        <ul className="leading-[20px] list-disc">
          <li className="mb-0 ms-[21px]">
            <span className="font-['Montserrat:Bold',sans-serif] font-bold">Theo dấu khối ngoại:</span>&nbsp;<span className="font-['Montserrat:Italic',sans-serif] font-normal italic">Quỹ Dragon Capital bất ngờ tăng tỷ trọng VNM trong báo cáo thay đổi sở hữu quý 1/2026.</span>
          </li>
          <li className="mb-0 ms-[21px]">
            <span className="font-['Montserrat:Bold',sans-serif] font-bold">Quản trị doanh nghiệp:</span>&nbsp;<span className="font-['Montserrat:Italic',sans-serif] font-normal italic">Vinamilk ban hành quy định mới về kiểm soát giao dịch nội bộ nhằm minh bạch hóa dòng vốn.</span>
          </li>
          <li className="ms-[21px]">
            <span className="font-['Montserrat:Bold',sans-serif] font-bold">Tin cổ tức:</span>&nbsp;<span className="font-['Montserrat:Italic',sans-serif] font-normal italic">Hội đồng quản trị Vinamilk dự kiến nâng tỷ lệ cổ tức tiền mặt thêm 5.2% nhờ dòng tiền tự do kỷ lục từ thị trường xuất khẩu.</span>
          </li>
        </ul>
      </div>
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Bold',sans-serif] font-bold h-[173px] justify-center leading-[0] left-[161.5px] text-[14px] text-black top-[499px] w-[442px]">
        <p className="leading-[20px] mb-0">MWG - 400 cổ phiếu</p>
        <ul className="leading-[20px] list-disc">
          <li className="mb-0 ms-[21px]">
            {`Phân tích định giá: `}
            <span className="font-['Montserrat:Italic',sans-serif] font-normal italic">So sánh đa yếu tố giữa MWG và các đối thủ cùng ngành bán lẻ điện máy trong năm 2026.</span>
          </li>
          <li className="mb-0 ms-[21px]">
            {`Báo cáo chiến lược: `}
            <span className="font-['Montserrat:Italic',sans-serif] font-normal italic">Nhận định của SSI Research về lợi thế cạnh tranh của chuỗi TopZone trước thềm ra mắt sản phẩm công nghệ mới.</span>
          </li>
          <li className="ms-[21px]">
            {`Kết quả kinh doanh: `}
            <span className="font-['Montserrat:Italic',sans-serif] font-normal italic">Tổng kết quý 4/2025: Biên lợi nhuận mảng ICT phục hồi mạnh mẽ sau giai đoạn tái cấu trúc toàn diện.</span>
          </li>
        </ul>
      </div>
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Bold',sans-serif] font-bold h-[139px] justify-center leading-[0] left-[161.5px] text-[14px] text-black top-[690px] w-[442px]">
        <p className="leading-[20px] mb-0">FPT - 200 cổ phiếu</p>
        <ul className="leading-[20px] list-disc">
          <li className="mb-0 ms-[21px]">
            {`Xu hướng AI: `}
            <span className="font-['Montserrat:Italic',sans-serif] font-normal italic">FPT ký kết biên bản ghi nhớ hợp tác chiến lược về đào tạo và cung ứng nhân lực AI cho các tập đoàn Big Tech toàn cầu.</span>
          </li>
          <li className="ms-[21px]">
            {`Báo cáo quỹ: `}
            <span className="font-['Montserrat:Italic',sans-serif] font-normal italic">VinaCapital đưa ra nhận định về triển vọng mảng xuất khẩu phần mềm của FPT trong báo cáo chiến lược quý 1/2026.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

function Background1() {
  return (
    <div className="absolute bg-white inset-[678px_576px_80px_576px] rounded-[12px]" data-name="Background">
      <div className="absolute bg-[rgba(255,255,255,0)] inset-0 rounded-[12px] shadow-[0px_16px_48px_-12px_rgba(147,51,234,0.25)]" data-name="Overlay+Shadow" />
      <Group3 />
    </div>
  );
}

function Svg2() {
  return (
    <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[16px] top-1/2" data-name="SVG">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g clipPath="url(#clip0_1_266)" id="SVG">
          <path clipRule="evenodd" d={svgPaths.p1aed1e00} fill="var(--fill-0, white)" fillRule="evenodd" id="Vector" />
        </g>
        <defs>
          <clipPath id="clip0_1_266">
            <rect fill="white" height="16" width="16" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Background2() {
  return (
    <div className="-translate-y-1/2 absolute left-[12px] rounded-[12px] size-[36px] top-1/2" data-name="Background" style={{ backgroundImage: "linear-gradient(135deg, rgb(8, 73, 172) 0%, rgb(37, 99, 235) 100%)" }}>
      <div className="-translate-y-1/2 absolute bg-[rgba(255,255,255,0)] left-0 rounded-[12px] shadow-[0px_4px_6px_-1px_rgba(168,85,247,0.25),0px_2px_4px_-2px_rgba(168,85,247,0.25)] size-[36px] top-1/2" data-name="Overlay+Shadow" />
      <Svg2 />
    </div>
  );
}

function BackgroundBorder() {
  return (
    <div className="absolute border border-[rgba(92,136,246,0.3)] border-solid bottom-[40.86%] left-[528px] rounded-[12px] top-[55.51%] w-[135.02px]" data-name="Background+Border" style={{ backgroundImage: "linear-gradient(134.422273deg, rgba(255, 255, 255, 0.9) 0%, rgb(219, 231, 255) 100%)" }}>
      <div className="absolute bg-[rgba(255,255,255,0)] inset-[-1px] rounded-[12px] shadow-[0px_4px_24px_-1px_rgba(147,51,234,0.08),0px_0px_0px_1px_rgba(147,51,234,0.03)]" data-name="Overlay+Shadow" />
      <Background2 />
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[15px] justify-center leading-[0] left-[58px] text-[#6b7280] text-[10px] top-[20px] w-[63.22px]">
        <p className="leading-[15px]">Daily Report</p>
      </div>
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Bold',sans-serif] font-bold h-[16px] justify-center leading-[0] left-[58px] text-[#111827] text-[12px] top-[35.5px] w-[42.238px]">
        <p className="leading-[16px]">+12.4%</p>
      </div>
    </div>
  );
}

function Svg3() {
  return (
    <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[16px] top-1/2" data-name="SVG">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g clipPath="url(#clip0_1_261)" id="SVG">
          <path d={svgPaths.p35ec0300} fill="var(--fill-0, white)" id="Vector" />
        </g>
        <defs>
          <clipPath id="clip0_1_261">
            <rect fill="white" height="16" width="16" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Background3() {
  return (
    <div className="-translate-y-1/2 absolute left-[12px] rounded-[12px] size-[36px] top-1/2" data-name="Background" style={{ backgroundImage: "linear-gradient(135deg, rgb(251, 191, 36) 0%, rgb(249, 115, 22) 100%)" }}>
      <div className="-translate-y-1/2 absolute bg-[rgba(255,255,255,0)] left-0 rounded-[12px] shadow-[0px_4px_6px_-1px_rgba(245,158,11,0.25),0px_2px_4px_-2px_rgba(245,158,11,0.25)] size-[36px] top-1/2" data-name="Overlay+Shadow" />
      <Svg3 />
    </div>
  );
}

function BackgroundBorder1() {
  return (
    <div className="absolute border border-[rgba(92,136,246,0.3)] border-solid bottom-[18.16%] right-[528px] rounded-[12px] top-[78.22%] w-[126.23px]" data-name="Background+Border" style={{ backgroundImage: "linear-gradient(134.452276deg, rgba(255, 255, 255, 0.9) 0%, rgb(232, 242, 255) 100%)" }}>
      <div className="absolute bg-[rgba(255,255,255,0)] inset-[-1px] rounded-[12px] shadow-[0px_4px_24px_-1px_rgba(147,51,234,0.08),0px_0px_0px_1px_rgba(147,51,234,0.03)]" data-name="Overlay+Shadow" />
      <Background3 />
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[15px] justify-center leading-[0] left-[58px] text-[#6b7280] text-[10px] top-[20px] w-[54.43px]">
        <p className="leading-[15px]">AI Insights</p>
      </div>
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Bold',sans-serif] font-bold h-[16px] justify-center leading-[0] left-[57.73px] text-[#111827] text-[12px] top-[35.33px] w-[44px]">
        <p className="leading-[16px]">Ready</p>
      </div>
    </div>
  );
}

function Section() {
  return (
    <div className="absolute h-[1600.89px] left-0 right-0 top-0" data-name="Section">
      <div className="absolute bg-[#84aefc] h-[12px] left-[10%] opacity-60 right-[89.38%] rounded-[9999px] top-[128px]" data-name="Background" />
      <div className="absolute bg-[rgba(132,166,252,0.1)] h-[16px] left-[84.17%] right-[15%] rounded-[9999px] top-[192px]" data-name="Overlay" />
      <div className="absolute bg-[rgba(85,142,247,0.4)] bottom-[160px] h-[8px] left-[20%] right-[79.58%] rounded-[9999px]" data-name="Overlay" />
      <div className="absolute border-2 border-[rgba(59,130,246,0.2)] border-solid inset-[33.33%_8%_65.42%_90.96%] rounded-[9999px]" data-name="Border" />
      <div className="absolute bg-[rgba(132,166,252,0.1)] bottom-[33.33%] left-[74.38%] right-1/4 rounded-[9999px] top-[65.92%]" data-name="Overlay" />
      <BackgroundBorderShadow />
      <div className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col font-['Montserrat:Bold',sans-serif] font-bold h-[218px] justify-center leading-[0] left-[calc(50%+1.28px)] text-[#111827] text-[65px] text-center top-[282px] tracking-[-2.4px] w-[1013.567px]">
        <p className="leading-[96px]">Hiểu điều gì tác động đên danh mục của bạn hàng ngày</p>
      </div>
      <div className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[53px] justify-center leading-[0] left-1/2 text-[#4b5563] text-[20px] text-center top-[430px] w-[821px]">
        <p>
          <span className="font-['Montserrat:Bold',sans-serif] font-bold leading-[28px]">{`News2stock `}</span>
          <span className="leading-[28px]">tổng hợp tin tức từ các nguồn xác thưc cho tưng tài sản trong danh mục của bạn, gửi thẳng cho bạn qua mail cho bạn trước khi thị trường mở cửa</span>
        </p>
      </div>
      <LinkButton1 />
      <Svg1 />
      <div className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[20px] justify-center leading-[0] left-[calc(50%+11.17px)] text-[#6b7280] text-[14px] text-center top-[calc(50%-196.45px)] w-[166.579px]">
        <p className="leading-[20px]">Huỷ bất cứ lúc nào</p>
      </div>
      <div className="absolute bg-gradient-to-r blur-[20px] from-[rgba(53,110,255,0.2)] inset-[654px_552px_56px_552px] rounded-[16px] to-[rgba(9,115,255,0.2)] via-1/2 via-[rgba(74,125,255,0.15)]" data-name="Gradient+Blur" />
      <div className="absolute blur-[10px] inset-[674px_572px_76px_572px] rounded-[24px]" data-name="Gradient+Blur" style={{ backgroundImage: "linear-gradient(135.000001deg, rgba(51, 146, 234, 0.15) 0%, rgba(132, 166, 252, 0.1) 50%, rgba(85, 155, 247, 0.15) 100%)" }} />
      <Background1 />
      <BackgroundBorder />
      <BackgroundBorder1 />
    </div>
  );
}

function Svg4() {
  return (
    <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2" data-name="SVG">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 24 24">
        <g clipPath="url(#clip0_1_272)" id="SVG">
          <path d={svgPaths.p3a237a80} fill="var(--fill-0, white)" id="Vector" />
          <path d={svgPaths.p37664160} fill="var(--fill-0, white)" id="Vector_2" />
          <path d={svgPaths.p1d680e80} fill="var(--fill-0, white)" id="Vector_3" />
        </g>
        <defs>
          <clipPath id="clip0_1_272">
            <rect fill="white" height="24" width="24" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Background4() {
  return (
    <div className="absolute left-[32px] rounded-[16px] size-[56px] top-[32px]" data-name="Background" style={{ backgroundImage: "linear-gradient(135deg, rgb(147, 51, 234) 0%, rgb(126, 34, 206) 100%)" }}>
      <div className="absolute bg-[rgba(255,255,255,0)] left-0 rounded-[16px] shadow-[0px_10px_15px_-3px_rgba(168,85,247,0.2),0px_4px_6px_-4px_rgba(168,85,247,0.2)] size-[56px] top-0" data-name="Overlay+Shadow" />
      <Svg4 />
    </div>
  );
}

function Svg5() {
  return (
    <div className="-translate-y-1/2 absolute left-0 size-[14px] top-[calc(50%+12px)]" data-name="SVG">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 14 14">
        <g clipPath="url(#clip0_1_240)" id="SVG">
          <path d={svgPaths.p1ccd2d00} fill="var(--fill-0, #0849AC)" id="Vector" />
        </g>
        <defs>
          <clipPath id="clip0_1_240">
            <rect fill="white" height="14" width="14" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function HorizontalBorder() {
  return (
    <div className="absolute border-[#e8f2ff] border-solid border-t h-[45px] left-[32px] right-[32px] top-[254px]" data-name="HorizontalBorder">
      <Svg5 />
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[20px] justify-center leading-[0] left-[22px] text-[#0849ac] text-[14px] top-[34px] w-[179.45px]">
        <p className="leading-[20px]">{`Được gửi lúc 6:00 sáng `}</p>
      </div>
    </div>
  );
}

function BackgroundBorderShadow1() {
  return (
    <div className="absolute bg-white border border-[rgba(232,240,255,0.5)] border-solid h-[333px] left-[352px] right-[1184px] rounded-[16px] shadow-[0px_1px_3px_0px_rgba(147,51,234,0.04),0px_4px_12px_0px_rgba(147,51,234,0.04)] top-[374px]" data-name="Background+Border+Shadow">
      <Background4 />
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Bold',sans-serif] font-bold h-[37px] justify-center leading-[0] left-[32.5px] text-[#111827] text-[20px] top-[121.11px] w-[133px]">
        <p className="leading-[28px]">Cập nhật hàng ngày</p>
      </div>
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[73px] justify-center leading-[0] left-[32px] text-[#4b5563] text-[16px] top-[190.5px] w-[295.29px]">
        <p className="leading-[26px]">Nhận các bản tin cá nhân hóa gửi thẳng vào hộp thư của bạn mỗi sáng trước khi thị trường mở cửa.</p>
      </div>
      <HorizontalBorder />
    </div>
  );
}

function Svg6() {
  return (
    <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2" data-name="SVG">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 24 24">
        <g id="SVG">
          <path clipRule="evenodd" d={svgPaths.p12ba2a00} fill="var(--fill-0, white)" fillRule="evenodd" id="Vector" />
        </g>
      </svg>
    </div>
  );
}

function Background5() {
  return (
    <div className="absolute left-[32px] rounded-[16px] size-[56px] top-[32px]" data-name="Background" style={{ backgroundImage: "linear-gradient(135deg, rgb(59, 130, 246) 0%, rgb(37, 99, 235) 100%)" }}>
      <div className="absolute bg-[rgba(255,255,255,0)] left-0 rounded-[16px] shadow-[0px_10px_15px_-3px_rgba(59,130,246,0.2),0px_4px_6px_-4px_rgba(59,130,246,0.2)] size-[56px] top-0" data-name="Overlay+Shadow" />
      <Svg6 />
    </div>
  );
}

function Svg7() {
  return (
    <div className="-translate-y-1/2 absolute left-0 size-[14px] top-[calc(50%+12px)]" data-name="SVG">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 14 14">
        <g clipPath="url(#clip0_1_255)" id="SVG">
          <path d={svgPaths.p1ccd2d00} fill="var(--fill-0, #2563EB)" id="Vector" />
        </g>
        <defs>
          <clipPath id="clip0_1_255">
            <rect fill="white" height="14" width="14" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function HorizontalBorder1() {
  return (
    <div className="absolute border-[#e8f2ff] border-solid border-t h-[45px] left-[32px] right-[32px] top-[254px]" data-name="HorizontalBorder">
      <Svg7 />
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[20px] justify-center leading-[0] left-[22px] text-[#2563eb] text-[14px] top-[34px] w-[161.37px]">
        <p className="leading-[20px]">Được mã hóa đầu cuối</p>
      </div>
    </div>
  );
}

function BackgroundBorderShadow2() {
  return (
    <div className="absolute bg-white border border-[rgba(232,240,255,0.5)] border-solid h-[333px] left-[768px] right-[768px] rounded-[16px] shadow-[0px_1px_3px_0px_rgba(147,51,234,0.04),0px_4px_12px_0px_rgba(147,51,234,0.04)] top-[374px]" data-name="Background+Border+Shadow">
      <Background5 />
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Bold',sans-serif] font-bold h-[28px] justify-center leading-[0] left-[32.5px] text-[#111827] text-[20px] top-[122.61px] w-[161.015px]">
        <p className="leading-[28px]">Bảo mật danh mục đầu tư</p>
      </div>
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[73px] justify-center leading-[0] left-[32.5px] text-[#4b5563] text-[16px] top-[199.11px] w-[305.58px]">
        <p className="leading-[26px]">Chúng tôi không lưu trữ tài liệu của bạn - chỉ ghi nhận những cổ phiếu và số lượng mà bạn cho phép</p>
      </div>
      <HorizontalBorder1 />
    </div>
  );
}

function Svg8() {
  return (
    <div className="-translate-y-1/2 absolute left-0 size-[14px] top-[calc(50%+12px)]" data-name="SVG">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 14 14">
        <g clipPath="url(#clip0_1_249)" id="SVG">
          <path d={svgPaths.p3f5c5480} fill="var(--fill-0, #D97706)" id="Vector" />
        </g>
        <defs>
          <clipPath id="clip0_1_249">
            <rect fill="white" height="14" width="14" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function HorizontalBorder2() {
  return (
    <div className="absolute border-[#e8f2ff] border-solid border-t h-[45px] left-[32px] right-[32px] top-[254px]" data-name="HorizontalBorder">
      <Svg8 />
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[20px] justify-center leading-[0] left-[22.5px] text-[#d97706] text-[14px] top-[33.61px] w-[228px]">
        <p className="leading-[20px]">Được vận hành bởi AI tiên tiến</p>
      </div>
    </div>
  );
}

function Svg9() {
  return (
    <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2" data-name="SVG">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 24 24">
        <g clipPath="url(#clip0_1_243)" id="SVG">
          <path d={svgPaths.p2d18ab00} fill="var(--fill-0, white)" id="Vector" />
        </g>
        <defs>
          <clipPath id="clip0_1_243">
            <rect fill="white" height="24" width="24" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Background6() {
  return (
    <div className="absolute left-[32px] rounded-[16px] size-[56px] top-[32px]" data-name="Background" style={{ backgroundImage: "linear-gradient(135deg, rgb(251, 191, 36) 0%, rgb(249, 115, 22) 100%)" }}>
      <div className="absolute bg-[rgba(255,255,255,0)] left-0 rounded-[16px] shadow-[0px_10px_15px_-3px_rgba(245,158,11,0.2),0px_4px_6px_-4px_rgba(245,158,11,0.2)] size-[56px] top-0" data-name="Overlay+Shadow" />
      <Svg9 />
    </div>
  );
}

function Background7() {
  return (
    <div className="absolute bg-gradient-to-r from-[#fbbf24] h-[28px] left-[298.06px] rounded-[9999px] to-[#f97316] top-[32px] w-[51.94px]" data-name="Background">
      <div className="absolute bg-[rgba(255,255,255,0)] inset-0 rounded-[9999px] shadow-[0px_10px_15px_-3px_rgba(245,158,11,0.25),0px_4px_6px_-4px_rgba(245,158,11,0.25)]" data-name="Overlay+Shadow" />
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Bold',sans-serif] font-bold h-[15px] justify-center leading-[0] left-[12px] text-[12px] text-white top-[13.5px] tracking-[0.3px] w-[28.308px]">
        <p className="leading-[16px]">PRO</p>
      </div>
    </div>
  );
}

function BackgroundBorderShadow3() {
  return (
    <div className="absolute bg-white border border-[rgba(232,240,255,0.5)] border-solid h-[333px] left-[1184px] overflow-clip right-[352px] rounded-[16px] shadow-[0px_1px_3px_0px_rgba(147,51,234,0.04),0px_4px_12px_0px_rgba(147,51,234,0.04)] top-[374px]" data-name="Background+Border+Shadow">
      <HorizontalBorder2 />
      <div className="absolute bg-[rgba(251,191,36,0.2)] blur-[32px] right-0 rounded-[9999px] size-[128px] top-0" data-name="Overlay+Blur" />
      <Background6 />
      <Background7 />
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Bold',sans-serif] font-bold h-[28px] justify-center leading-[0] left-[32px] text-[#111827] text-[20px] top-[119px] w-[195.352px]">
        <p className="leading-[28px]">Phân tích AI</p>
      </div>
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[73px] justify-center leading-[0] left-[32px] text-[#4b5563] text-[16px] top-[190.5px] w-[296.67px]">
        <p className="leading-[26px]">Tận dụng AI Thế hệ Mới để phân tích mức độ tác độ tin tức liên quan đến danh mục đầu tư của bạn với độ sâu chưa từng có.</p>
      </div>
    </div>
  );
}

function Section1() {
  return (
    <div className="absolute bg-white h-[835px] left-0 right-0 top-[1600.89px]" data-name="Section">
      <div className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col font-['Montserrat:SemiBold',sans-serif] font-semibold h-[20px] justify-center leading-[0] left-1/2 text-[#0849ac] text-[14px] text-center top-[139.61px] tracking-[0.7px] uppercase w-[93px]">
        <p className="leading-[20px]">Tính năng</p>
      </div>
      <div className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col font-['Montserrat:Bold',sans-serif] font-bold h-[48px] justify-center leading-[0] left-[calc(50%+0.16px)] text-[#111827] text-[48px] text-center top-[190px] w-[652.557px]">
        <p className="leading-[48px]">Tại sao là News2stock</p>
      </div>
      <div className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[50px] justify-center leading-[0] left-[calc(50%+0.1px)] text-[#4b5563] text-[18px] text-center top-[266px] w-[565.6px]">
        <p className="leading-[28px]">Hiểu những gì sẽ tác động đến danh mục của bạn vào mỗi sáng</p>
      </div>
      <BackgroundBorderShadow1 />
      <BackgroundBorderShadow2 />
      <BackgroundBorderShadow3 />
    </div>
  );
}

function Wealthsimple() {
  return (
    <div className="-translate-x-1/2 -translate-y-1/2 absolute h-[40px] left-[calc(50%-168.52px)] opacity-40 top-[calc(50%+26px)] w-[276.75px]" data-name="Wealthsimple">
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 overflow-hidden">
          <img alt="" className="absolute left-0 max-w-none size-full top-0" src={imgWealthsimple} />
        </div>
        <div className="absolute bg-white inset-0 mix-blend-saturation" />
      </div>
    </div>
  );
}

function Rbc() {
  return (
    <div className="-translate-x-1/2 -translate-y-1/2 absolute h-[96px] left-[calc(50%+60.8px)] opacity-40 top-[calc(50%+26px)] w-[53.89px]" data-name="RBC">
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 overflow-hidden">
          <img alt="" className="absolute h-full left-0 max-w-none top-0 w-[100.01%]" src={imgRbc} />
        </div>
        <div className="absolute bg-white inset-0 mix-blend-saturation" />
      </div>
    </div>
  );
}

function Cibc() {
  return (
    <div className="-translate-x-1/2 -translate-y-1/2 absolute h-[40px] left-[calc(50%+229.32px)] opacity-40 top-[calc(50%+26px)] w-[155.14px]" data-name="CIBC">
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 overflow-hidden">
          <img alt="" className="absolute h-full left-0 max-w-none top-0 w-[100.01%]" src={imgCibc} />
        </div>
        <div className="absolute bg-white inset-0 mix-blend-saturation" />
      </div>
    </div>
  );
}

function BackgroundBorder2() {
  return (
    <div className="absolute bg-white border border-[rgba(232,240,255,0.5)] border-solid h-[246px] left-[352px] right-[352px] rounded-[24px] top-[112px]" data-name="Background+Border">
      <div className="absolute bg-[rgba(255,255,255,0)] inset-[-1px] rounded-[24px] shadow-[0px_20px_25px_-5px_rgba(168,85,247,0.05),0px_8px_10px_-6px_rgba(168,85,247,0.05)]" data-name="Overlay+Shadow" />
      <div className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[20px] justify-center leading-[0] left-[calc(50%+0.1px)] text-[#6b7280] text-[14px] text-center top-[58px] tracking-[0.7px] uppercase w-[416.01px]">
        <p className="leading-[20px]">các trang tin tức tài chính được xác thưc</p>
      </div>
      <Wealthsimple />
      <Rbc />
      <Cibc />
    </div>
  );
}

function Section2() {
  return (
    <div className="absolute bg-gradient-to-b from-white h-[470px] left-0 right-0 to-[rgba(245,249,255,0.5)] top-[2435.89px]" data-name="Section">
      <BackgroundBorder2 />
    </div>
  );
}

function Svg10() {
  return (
    <div className="-translate-y-1/2 absolute left-[203.5px] size-[18px] top-1/2" data-name="SVG">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 18 18">
        <g id="SVG">
          <path clipRule="evenodd" d={svgPaths.p2c3d3e0} fill="var(--fill-0, #032D6B)" fillRule="evenodd" id="Vector" />
        </g>
      </svg>
    </div>
  );
}

function LinkButton2() {
  return (
    <div className="-translate-x-1/2 absolute bg-white h-[68px] left-1/2 rounded-[12px] top-[368px] w-[261.5px]" data-name="Link → Button">
      <div className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col font-['Montserrat:Bold',sans-serif] font-bold h-[22px] justify-center leading-[0] left-[calc(50%-20.5px)] text-[#032d6b] text-[18px] text-center top-[calc(50%-0.39px)] w-[164px]">
        <p className="leading-[28px]">Bắt đầu miễn phí</p>
      </div>
      <Svg10 />
    </div>
  );
}

function Section3() {
  return (
    <div className="absolute h-[564px] left-0 overflow-clip right-0 top-[2905.89px]" data-name="Section">
      <div className="absolute inset-0" data-name="Gradient" style={{ backgroundImage: "linear-gradient(163.629849deg, rgb(37, 99, 235) 0%, rgb(8, 73, 172) 50%, rgb(3, 45, 107) 100%)" }} />
      <div className="absolute inset-0 opacity-10" data-name="Gradient" style={{ backgroundImage: "url('data:image/svg+xml;utf8,<svg viewBox=\\'0 0 1920 564\\' xmlns=\\'http://www.w3.org/2000/svg\\' preserveAspectRatio=\\'none\\'><rect x=\\'0\\' y=\\'0\\' height=\\'100%\\' width=\\'100%\\' fill=\\'url(%23grad)\\' opacity=\\'1\\'/><defs><radialGradient id=\\'grad\\' gradientUnits=\\'userSpaceOnUse\\' cx=\\'0\\' cy=\\'0\\' r=\\'10\\' gradientTransform=\\'matrix(135.76 0 0 39.881 960 282)\\'><stop stop-color=\\'rgba(147,51,234,0.12)\\' offset=\\'0.029463\\'/><stop stop-color=\\'rgba(147,51,234,0)\\' offset=\\'0.029463\\'/></radialGradient></defs></svg>')" }} />
      <div className="absolute bg-[rgba(139,187,250,0.2)] blur-[50px] h-[384px] left-1/4 right-[55%] rounded-[9999px] top-0" data-name="Overlay+Blur" />
      <div className="absolute bg-[rgba(92,136,246,0.3)] blur-[50px] bottom-0 h-[384px] left-[55%] right-1/4 rounded-[9999px]" data-name="Overlay+Blur" />
      <div className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col font-['Montserrat:Bold',sans-serif] font-bold h-[137px] justify-center leading-[0] left-[calc(50%+0.1px)] text-[50px] text-center text-white top-[187.5px] w-[646.82px]">
        <p className="leading-[60px]">Sẵn sàng nâng tầm danh mục đầu tư của bạn chưa?</p>
      </div>
      <div className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[53px] justify-center leading-[0] left-[calc(50%+0.13px)] text-[#90bcf5] text-[20px] text-center top-[311.11px] w-[607.25px]">
        <p className="leading-[28px]">Bắt đầu miễn phí, nâng cấp bất cứ lúc nào.</p>
      </div>
      <LinkButton2 />
    </div>
  );
}

function Group4() {
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

function StockxComLogo1() {
  return (
    <div className="absolute left-[-0.5px] overflow-clip size-[44px] top-[0.5px]" data-name="stockx.com logo">
      <Group4 />
    </div>
  );
}

function Link1() {
  return (
    <div className="-translate-y-1/2 absolute h-[44px] left-[352px] top-[calc(50%-0.39px)] w-[191.91px]" data-name="Link">
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Bold',sans-serif] font-bold h-[28px] justify-center leading-[0] left-[56px] text-[#111827] text-[20px] top-[22px] w-[136.215px]">
        <p className="leading-[28px]">News2stock</p>
      </div>
      <div className="absolute bg-[rgba(92,136,246,0.3)] blur-[6px] inset-[0_147.91px_0_0] opacity-0 rounded-[9999px]" data-name="Overlay+Blur" />
      <StockxComLogo1 />
    </div>
  );
}

function Footer() {
  return (
    <div className="absolute bg-white border-[#e8f2ff] border-solid border-t h-[137px] left-0 right-0 top-[3469.89px]" data-name="Footer">
      <div className="-translate-y-1/2 absolute flex flex-col font-['Montserrat:Regular',sans-serif] font-normal h-[18px] justify-center leading-[0] left-[1266.67px] text-[#6b7280] text-[14px] top-[68px] w-[301.647px]">
        <p className="leading-[20px]">{`© 2026 `}</p>
      </div>
      <Link1 />
    </div>
  );
}

function Background() {
  return (
    <div className="absolute bg-gradient-to-b from-white h-[3606.89px] left-0 right-0 to-white top-0 via-1/2 via-[rgba(245,251,255,0.3)]" data-name="Background">
      <Container />
      <Section />
      <Section1 />
      <Section2 />
      <Section3 />
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