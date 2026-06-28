import svgPaths from "./svg-20kxd5ghit";

function Paragraph() {
  return (
    <div className="[word-break:break-word] content-stretch flex flex-col gap-[32px] items-center leading-[0] not-italic px-[16px] relative shrink-0 text-center whitespace-nowrap" data-name="Paragraph">
      <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold justify-center relative shrink-0 text-[#09090b] text-[46.7px]">
        <p className="leading-[60px]">Choose your strategy</p>
      </div>
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center relative shrink-0 text-[#71717b] text-[18.4px]">
        <p className="leading-[28px]">From getting started to going pro, find the plan that matches your needs.</p>
      </div>
    </div>
  );
}

function Container2() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="[word-break:break-word] flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#09090b] text-[13.2px] whitespace-nowrap">
        <p className="leading-[20px]">Monthly</p>
      </div>
    </div>
  );
}

function Background() {
  return (
    <div className="bg-[#f8f7f7] relative rounded-[33554400px] shrink-0 size-[16px]" data-name="Background">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start justify-center relative size-full">
        <div className="bg-[rgba(255,255,255,0)] relative rounded-[33554400px] shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)] shrink-0 size-[16px]" data-name="Overlay+Shadow" />
      </div>
    </div>
  );
}

function Switch() {
  return (
    <div className="bg-[#e9680c] content-stretch drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)] flex h-[20px] items-center pl-[18px] pr-[2px] py-[2px] relative rounded-[33554400px] shrink-0 w-[36px]" data-name="Switch">
      <div aria-hidden className="absolute border-2 border-[rgba(0,0,0,0)] border-solid inset-0 pointer-events-none rounded-[33554400px]" />
      <Background />
    </div>
  );
}

function Overlay() {
  return (
    <div className="bg-[rgba(233,104,12,0.1)] content-stretch flex items-start px-[8px] relative rounded-[33554400px] shrink-0" data-name="Overlay">
      <div className="[word-break:break-word] flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#e9680c] text-[11.8px] whitespace-nowrap">
        <p className="leading-[16px]">Save 15% or more</p>
      </div>
    </div>
  );
}

function Container3() {
  return (
    <div className="content-stretch flex gap-[6px] items-center relative shrink-0" data-name="Container">
      <div className="[word-break:break-word] flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#09090b] text-[13.7px] whitespace-nowrap">
        <p className="leading-[20px]">Yearly</p>
      </div>
      <Overlay />
    </div>
  );
}

function Container1() {
  return (
    <div className="content-stretch flex gap-[16px] items-center relative shrink-0" data-name="Container">
      <Container2 />
      <Switch />
      <Container3 />
    </div>
  );
}

function Separator() {
  return <div className="absolute bg-gradient-to-r from-[rgba(9,9,11,0)] h-px left-[10.22%] right-[10.22%] to-[rgba(9,9,11,0)] top-px via-1/2 via-[rgba(9,9,11,0.6)]" data-name="Separator" />;
}

function Heading() {
  return (
    <div className="content-stretch flex items-center relative shrink-0 w-full" data-name="Heading 2">
      <div className="[word-break:break-word] flex flex-[1_0_0] flex-col font-['Inter:Bold',sans-serif] font-bold justify-center leading-[0] min-w-px not-italic relative text-[#09090b] text-[15.6px]">
        <p className="leading-[24px]">Free</p>
      </div>
    </div>
  );
}

function Container7() {
  return (
    <div className="content-stretch flex flex-col items-start max-w-[220px] relative shrink-0 w-[220px]" data-name="Container">
      <div className="[word-break:break-word] flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#71717b] text-[12.9px] whitespace-nowrap">
        <p className="leading-[20px]">Perfect for getting started</p>
      </div>
    </div>
  );
}

function Container6() {
  return (
    <div className="content-stretch flex flex-col gap-[8px] items-start relative shrink-0 w-full" data-name="Container">
      <Heading />
      <Container7 />
    </div>
  );
}

function Paragraph1() {
  return (
    <div className="[word-break:break-word] content-stretch flex font-['Inter:Bold',sans-serif] font-bold gap-[4px] items-baseline leading-[0] not-italic relative shrink-0 whitespace-nowrap" data-name="Paragraph">
      <div className="flex flex-col justify-center relative shrink-0 text-[#71717b] text-[24px]">
        <p className="leading-[32px]">$</p>
      </div>
      <div className="flex flex-col justify-center relative shrink-0 text-[#09090b] text-[57.8px]">
        <p className="leading-[60px]">0</p>
      </div>
    </div>
  );
}

function Container8() {
  return (
    <div className="content-stretch flex items-center relative shrink-0 w-full" data-name="Container">
      <Paragraph1 />
    </div>
  );
}

function Link() {
  return (
    <div className="bg-gradient-to-b from-[rgba(252,252,252,0.6)] h-[40px] relative rounded-[8px] shrink-0 to-[rgba(252,252,252,0.2)] w-full" data-name="Link">
      <div aria-hidden className="absolute border border-[#e4e4e7] border-solid inset-0 pointer-events-none rounded-[8px]" />
      <div className="flex flex-row items-center justify-center size-full">
        <div className="content-stretch flex items-center justify-center px-[21px] py-px relative size-full">
          <div className="absolute bg-[rgba(255,255,255,0)] h-[40px] left-0 right-[0.01px] rounded-[8px] shadow-[0px_4px_6px_-1px_rgba(0,0,0,0.03),0px_2px_4px_-2px_rgba(0,0,0,0.03)] top-0" data-name="Link:shadow" />
          <div className="[word-break:break-word] flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#09090b] text-[13.3px] text-center whitespace-nowrap">
            <p className="leading-[20px]">Get started</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Container9() {
  return (
    <div className="content-stretch flex flex-col items-start max-w-[220px] min-h-[40px] pb-[20px] relative shrink-0 w-[220px]" data-name="Container">
      <div className="[word-break:break-word] flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#71717b] text-[13.3px] whitespace-nowrap">
        <p className="leading-[20px]">Free forever</p>
      </div>
    </div>
  );
}

function Separator1() {
  return (
    <div className="h-px relative shrink-0 w-full" data-name="Separator">
      <div aria-hidden className="absolute border-[#e4e4e7] border-solid border-t inset-0 pointer-events-none" />
    </div>
  );
}

function Container5() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[28px] items-start relative size-full">
        <Container6 />
        <Container8 />
        <Link />
        <Container9 />
        <Separator1 />
      </div>
    </div>
  );
}

function Svg() {
  return (
    <div className="relative shrink-0 size-[16px]" data-name="SVG">
      <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g clipPath="url(#clip0_14_317)" id="SVG">
          <path d={svgPaths.p34e03900} id="Vector" stroke="var(--stroke-0, #71717B)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d={svgPaths.p1f2c5400} id="Vector_2" stroke="var(--stroke-0, #71717B)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
        </g>
        <defs>
          <clipPath id="clip0_14_317">
            <rect fill="white" height="16" width="16" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Item() {
  return (
    <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full" data-name="Item">
      <Svg />
      <div className="[word-break:break-word] flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#09090b] text-[13.5px] whitespace-nowrap">
        <p className="leading-[20px]">10 messages per day</p>
      </div>
    </div>
  );
}

function Svg1() {
  return (
    <div className="relative shrink-0 size-[16px]" data-name="SVG">
      <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g clipPath="url(#clip0_14_317)" id="SVG">
          <path d={svgPaths.p34e03900} id="Vector" stroke="var(--stroke-0, #71717B)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d={svgPaths.p1f2c5400} id="Vector_2" stroke="var(--stroke-0, #71717B)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
        </g>
        <defs>
          <clipPath id="clip0_14_317">
            <rect fill="white" height="16" width="16" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Item1() {
  return (
    <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full" data-name="Item">
      <Svg1 />
      <div className="[word-break:break-word] flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#09090b] text-[13.1px] whitespace-nowrap">
        <p className="leading-[20px] mb-0">Up to 2 AI strategies (only weekly cadence</p>
        <p className="leading-[20px]">available)</p>
      </div>
    </div>
  );
}

function Svg2() {
  return (
    <div className="relative shrink-0 size-[16px]" data-name="SVG">
      <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g clipPath="url(#clip0_14_317)" id="SVG">
          <path d={svgPaths.p34e03900} id="Vector" stroke="var(--stroke-0, #71717B)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d={svgPaths.p1f2c5400} id="Vector_2" stroke="var(--stroke-0, #71717B)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
        </g>
        <defs>
          <clipPath id="clip0_14_317">
            <rect fill="white" height="16" width="16" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Item2() {
  return (
    <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full" data-name="Item">
      <Svg2 />
      <div className="[word-break:break-word] flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#09090b] text-[13.3px] whitespace-nowrap">
        <p className="leading-[20px]">Basic market data</p>
      </div>
    </div>
  );
}

function Svg3() {
  return (
    <div className="relative shrink-0 size-[16px]" data-name="SVG">
      <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g clipPath="url(#clip0_14_317)" id="SVG">
          <path d={svgPaths.p34e03900} id="Vector" stroke="var(--stroke-0, #71717B)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d={svgPaths.p1f2c5400} id="Vector_2" stroke="var(--stroke-0, #71717B)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
        </g>
        <defs>
          <clipPath id="clip0_14_317">
            <rect fill="white" height="16" width="16" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Item3() {
  return (
    <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full" data-name="Item">
      <Svg3 />
      <div className="[word-break:break-word] flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#09090b] text-[13.1px] whitespace-nowrap">
        <p className="leading-[20px]">Community support</p>
      </div>
    </div>
  );
}

function List() {
  return (
    <div className="relative shrink-0 w-full" data-name="List">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[8px] items-start relative size-full">
        <Item />
        <Item1 />
        <Item2 />
        <Item3 />
      </div>
    </div>
  );
}

function BackgroundBorderShadow() {
  return (
    <div className="bg-gradient-to-b col-1 from-[rgba(252,252,252,0.8)] justify-self-stretch max-w-[1280px] relative rounded-[18px] row-1 self-start shrink-0 to-[rgba(252,252,252,0)]" data-name="Background+Border+Shadow">
      <div className="max-w-[inherit] overflow-clip rounded-[inherit] size-full">
        <div className="content-stretch flex flex-col gap-[24px] items-start max-w-[inherit] pb-[69px] pt-[33px] px-[33px] relative size-full">
          <Separator />
          <Container5 />
          <List />
        </div>
      </div>
      <div aria-hidden className="absolute border border-[#e4e4e7] border-solid inset-0 pointer-events-none rounded-[18px] shadow-[0px_20px_25px_-5px_rgba(0,0,0,0.03),0px_8px_10px_-6px_rgba(0,0,0,0.03)]" />
    </div>
  );
}

function Separator2() {
  return <div className="absolute bg-gradient-to-r from-[rgba(9,9,11,0)] h-px left-[10.22%] right-[10.22%] to-[rgba(9,9,11,0)] top-px via-1/2 via-[rgba(9,9,11,0.6)]" data-name="Separator" />;
}

function Heading1() {
  return (
    <div className="content-stretch flex items-center relative shrink-0 w-full" data-name="Heading 2">
      <div className="[word-break:break-word] flex flex-[1_0_0] flex-col font-['Inter:Bold',sans-serif] font-bold justify-center leading-[0] min-w-px not-italic relative text-[#09090b] text-[16px]">
        <p className="leading-[24px]">Pro</p>
      </div>
    </div>
  );
}

function Container12() {
  return (
    <div className="content-stretch flex flex-col items-start max-w-[220px] relative shrink-0 w-[220px]" data-name="Container">
      <div className="[word-break:break-word] flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#71717b] text-[13px] whitespace-nowrap">
        <p className="leading-[20px]">Daily monitoring of your portfolio</p>
      </div>
    </div>
  );
}

function Container11() {
  return (
    <div className="content-stretch flex flex-col gap-[8px] items-start relative shrink-0 w-full" data-name="Container">
      <Heading1 />
      <Container12 />
    </div>
  );
}

function Paragraph2() {
  return (
    <div className="[word-break:break-word] content-stretch flex font-['Inter:Bold',sans-serif] font-bold gap-[4px] items-baseline leading-[0] not-italic relative shrink-0 whitespace-nowrap" data-name="Paragraph">
      <div className="flex flex-col justify-center relative shrink-0 text-[#71717b] text-[24px]">
        <p className="leading-[32px]">$</p>
      </div>
      <div className="flex flex-col justify-center relative shrink-0 text-[#09090b] text-[60px]">
        <p className="leading-[60px]">16</p>
      </div>
    </div>
  );
}

function Container13() {
  return (
    <div className="content-stretch flex items-center relative shrink-0 w-full" data-name="Container">
      <Paragraph2 />
    </div>
  );
}

function Link1() {
  return (
    <div className="bg-[#e9680c] h-[40px] relative rounded-[8px] shrink-0 w-full" data-name="Link">
      <div className="flex flex-row items-center justify-center size-full">
        <div className="content-stretch flex items-center justify-center px-[20px] relative size-full">
          <div className="absolute bg-[rgba(255,255,255,0)] h-[40px] left-0 right-0 rounded-[8px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)] top-0" data-name="Link:shadow" />
          <div className="[word-break:break-word] flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#fafafa] text-[13.3px] text-center whitespace-nowrap">
            <p className="leading-[20px]">Get started</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Container14() {
  return (
    <div className="content-stretch flex flex-col items-start max-w-[220px] min-h-[40px] pb-[20px] relative shrink-0 w-[220px]" data-name="Container">
      <div className="[word-break:break-word] flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#71717b] text-[13.3px] whitespace-nowrap">
        <p className="leading-[20px]">Billed yearly ($192/year)</p>
      </div>
    </div>
  );
}

function Separator3() {
  return (
    <div className="h-px relative shrink-0 w-full" data-name="Separator">
      <div aria-hidden className="absolute border-[#e4e4e7] border-solid border-t inset-0 pointer-events-none" />
    </div>
  );
}

function Container10() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[28px] items-start relative size-full">
        <Container11 />
        <Container13 />
        <Link1 />
        <Container14 />
        <Separator3 />
      </div>
    </div>
  );
}

function Svg4() {
  return (
    <div className="relative shrink-0 size-[16px]" data-name="SVG">
      <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g clipPath="url(#clip0_14_317)" id="SVG">
          <path d={svgPaths.p34e03900} id="Vector" stroke="var(--stroke-0, #71717B)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d={svgPaths.p1f2c5400} id="Vector_2" stroke="var(--stroke-0, #71717B)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
        </g>
        <defs>
          <clipPath id="clip0_14_317">
            <rect fill="white" height="16" width="16" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Item4() {
  return (
    <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full" data-name="Item">
      <Svg4 />
      <div className="[word-break:break-word] flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#09090b] text-[13.3px] whitespace-nowrap">
        <p className="leading-[20px]">Everything in Free, plus:</p>
      </div>
    </div>
  );
}

function Svg5() {
  return (
    <div className="relative shrink-0 size-[16px]" data-name="SVG">
      <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g clipPath="url(#clip0_14_317)" id="SVG">
          <path d={svgPaths.p34e03900} id="Vector" stroke="var(--stroke-0, #71717B)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d={svgPaths.p1f2c5400} id="Vector_2" stroke="var(--stroke-0, #71717B)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
        </g>
        <defs>
          <clipPath id="clip0_14_317">
            <rect fill="white" height="16" width="16" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Item5() {
  return (
    <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full" data-name="Item">
      <Svg5 />
      <div className="[word-break:break-word] flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#09090b] text-[13.3px] whitespace-nowrap">
        <p className="leading-[20px]">Unlimited messages</p>
      </div>
    </div>
  );
}

function Svg6() {
  return (
    <div className="relative shrink-0 size-[16px]" data-name="SVG">
      <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g clipPath="url(#clip0_14_317)" id="SVG">
          <path d={svgPaths.p34e03900} id="Vector" stroke="var(--stroke-0, #71717B)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d={svgPaths.p1f2c5400} id="Vector_2" stroke="var(--stroke-0, #71717B)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
        </g>
        <defs>
          <clipPath id="clip0_14_317">
            <rect fill="white" height="16" width="16" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Item6() {
  return (
    <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full" data-name="Item">
      <Svg6 />
      <div className="[word-break:break-word] flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#09090b] text-[13.1px] whitespace-nowrap">
        <p className="leading-[20px]">Up to 3 daily reports</p>
      </div>
    </div>
  );
}

function Svg7() {
  return (
    <div className="relative shrink-0 size-[16px]" data-name="SVG">
      <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g clipPath="url(#clip0_14_317)" id="SVG">
          <path d={svgPaths.p34e03900} id="Vector" stroke="var(--stroke-0, #71717B)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d={svgPaths.p1f2c5400} id="Vector_2" stroke="var(--stroke-0, #71717B)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
        </g>
        <defs>
          <clipPath id="clip0_14_317">
            <rect fill="white" height="16" width="16" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Item7() {
  return (
    <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full" data-name="Item">
      <Svg7 />
      <div className="[word-break:break-word] flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#09090b] text-[13.2px] whitespace-nowrap">
        <p className="leading-[20px]">Up to 5 AI strategies</p>
      </div>
    </div>
  );
}

function Svg8() {
  return (
    <div className="relative shrink-0 size-[16px]" data-name="SVG">
      <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g clipPath="url(#clip0_14_317)" id="SVG">
          <path d={svgPaths.p34e03900} id="Vector" stroke="var(--stroke-0, #71717B)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d={svgPaths.p1f2c5400} id="Vector_2" stroke="var(--stroke-0, #71717B)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
        </g>
        <defs>
          <clipPath id="clip0_14_317">
            <rect fill="white" height="16" width="16" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Item8() {
  return (
    <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full" data-name="Item">
      <Svg8 />
      <div className="[word-break:break-word] flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#09090b] text-[13.2px] whitespace-nowrap">
        <p className="leading-[20px]">{`Portfolio insights & alerts`}</p>
      </div>
    </div>
  );
}

function Svg9() {
  return (
    <div className="relative shrink-0 size-[16px]" data-name="SVG">
      <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g clipPath="url(#clip0_14_317)" id="SVG">
          <path d={svgPaths.p34e03900} id="Vector" stroke="var(--stroke-0, #71717B)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d={svgPaths.p1f2c5400} id="Vector_2" stroke="var(--stroke-0, #71717B)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
        </g>
        <defs>
          <clipPath id="clip0_14_317">
            <rect fill="white" height="16" width="16" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Item9() {
  return (
    <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full" data-name="Item">
      <Svg9 />
      <div className="[word-break:break-word] flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#09090b] text-[13.1px] whitespace-nowrap">
        <p className="leading-[20px]">Priority support</p>
      </div>
    </div>
  );
}

function List1() {
  return (
    <div className="relative shrink-0 w-full" data-name="List">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[8px] items-start relative size-full">
        <Item4 />
        <Item5 />
        <Item6 />
        <Item7 />
        <Item8 />
        <Item9 />
      </div>
    </div>
  );
}

function BackgroundBorderShadow1() {
  return (
    <div className="bg-gradient-to-b col-2 from-[#fcfcfc] justify-self-stretch max-w-[1280px] relative rounded-[18px] row-1 self-start shrink-0 to-[rgba(252,252,252,0.8)]" data-name="Background+Border+Shadow">
      <div className="max-w-[inherit] overflow-clip rounded-[inherit] size-full">
        <div className="content-stretch flex flex-col gap-[24px] items-start max-w-[inherit] p-[33px] relative size-full">
          <Separator2 />
          <Container10 />
          <List1 />
          <div className="absolute blur-[36px] h-[128px] left-[0.27%] max-w-[960px] right-[0.28%] rounded-[122.17px] top-[-127px]" data-name="Blur" />
        </div>
      </div>
      <div aria-hidden className="absolute border border-[#e4e4e7] border-solid inset-0 pointer-events-none rounded-[18px] shadow-[0px_20px_25px_-5px_rgba(0,0,0,0.03),0px_8px_10px_-6px_rgba(0,0,0,0.03)]" />
    </div>
  );
}

function Separator4() {
  return <div className="absolute bg-gradient-to-r from-[rgba(233,104,12,0)] h-px left-[10.22%] right-[10.22%] to-[rgba(233,104,12,0)] top-px via-1/2 via-[#e9680c]" data-name="Separator" />;
}

function Heading2() {
  return (
    <div className="content-stretch flex items-center relative shrink-0 w-full" data-name="Heading 2">
      <div className="[word-break:break-word] flex flex-[1_0_0] flex-col font-['Inter:Bold',sans-serif] font-bold justify-center leading-[0] min-w-px not-italic relative text-[#09090b] text-[15.1px]">
        <p className="leading-[24px]">Max</p>
      </div>
    </div>
  );
}

function Container17() {
  return (
    <div className="content-stretch flex flex-col items-start max-w-[220px] relative shrink-0 w-[220px]" data-name="Container">
      <div className="[word-break:break-word] flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#71717b] text-[13.3px] whitespace-nowrap">
        <p className="leading-[20px]">{`Unlimited access & premium data`}</p>
      </div>
    </div>
  );
}

function Container16() {
  return (
    <div className="content-stretch flex flex-col gap-[8px] items-start relative shrink-0 w-full" data-name="Container">
      <Heading2 />
      <Container17 />
    </div>
  );
}

function Paragraph3() {
  return (
    <div className="[word-break:break-word] content-stretch flex font-['Inter:Bold',sans-serif] font-bold gap-[4px] items-baseline leading-[0] not-italic relative shrink-0 whitespace-nowrap" data-name="Paragraph">
      <div className="flex flex-col justify-center relative shrink-0 text-[#71717b] text-[24px]">
        <p className="leading-[32px]">$</p>
      </div>
      <div className="flex flex-col justify-center relative shrink-0 text-[#09090b] text-[52.7px]">
        <p className="leading-[60px]">40</p>
      </div>
    </div>
  );
}

function Container18() {
  return (
    <div className="content-stretch flex items-center relative shrink-0 w-full" data-name="Container">
      <Paragraph3 />
    </div>
  );
}

function Link2() {
  return (
    <div className="bg-[#e9680c] h-[40px] relative rounded-[8px] shrink-0 w-full" data-name="Link">
      <div className="flex flex-row items-center justify-center size-full">
        <div className="content-stretch flex items-center justify-center px-[20px] relative size-full">
          <div className="absolute bg-[rgba(255,255,255,0)] h-[40px] left-0 right-[0.01px] rounded-[8px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)] top-0" data-name="Link:shadow" />
          <div className="[word-break:break-word] flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#fafafa] text-[13.3px] text-center whitespace-nowrap">
            <p className="leading-[20px]">Get started</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Container19() {
  return (
    <div className="content-stretch flex flex-col items-start max-w-[220px] min-h-[40px] pb-[20px] relative shrink-0 w-[220px]" data-name="Container">
      <div className="[word-break:break-word] flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#71717b] text-[13.2px] whitespace-nowrap">
        <p className="leading-[20px]">Billed yearly ($480/year)</p>
      </div>
    </div>
  );
}

function Separator5() {
  return (
    <div className="h-px relative shrink-0 w-full" data-name="Separator">
      <div aria-hidden className="absolute border-[#e4e4e7] border-solid border-t inset-0 pointer-events-none" />
    </div>
  );
}

function Container15() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[28px] items-start relative size-full">
        <Container16 />
        <Container18 />
        <Link2 />
        <Container19 />
        <Separator5 />
      </div>
    </div>
  );
}

function Svg10() {
  return (
    <div className="relative shrink-0 size-[16px]" data-name="SVG">
      <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g clipPath="url(#clip0_14_317)" id="SVG">
          <path d={svgPaths.p34e03900} id="Vector" stroke="var(--stroke-0, #71717B)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d={svgPaths.p1f2c5400} id="Vector_2" stroke="var(--stroke-0, #71717B)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
        </g>
        <defs>
          <clipPath id="clip0_14_317">
            <rect fill="white" height="16" width="16" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Item10() {
  return (
    <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full" data-name="Item">
      <Svg10 />
      <div className="[word-break:break-word] flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#09090b] text-[13.3px] whitespace-nowrap">
        <p className="leading-[20px]">Everything in Pro, plus:</p>
      </div>
    </div>
  );
}

function Svg11() {
  return (
    <div className="relative shrink-0 size-[16px]" data-name="SVG">
      <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g clipPath="url(#clip0_14_317)" id="SVG">
          <path d={svgPaths.p34e03900} id="Vector" stroke="var(--stroke-0, #71717B)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d={svgPaths.p1f2c5400} id="Vector_2" stroke="var(--stroke-0, #71717B)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
        </g>
        <defs>
          <clipPath id="clip0_14_317">
            <rect fill="white" height="16" width="16" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Item11() {
  return (
    <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full" data-name="Item">
      <Svg11 />
      <div className="[word-break:break-word] flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#09090b] text-[13px] whitespace-nowrap">
        <p className="leading-[20px]">Unlimited strategies with any cadence</p>
      </div>
    </div>
  );
}

function Svg12() {
  return (
    <div className="relative shrink-0 size-[16px]" data-name="SVG">
      <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g clipPath="url(#clip0_14_317)" id="SVG">
          <path d={svgPaths.p34e03900} id="Vector" stroke="var(--stroke-0, #71717B)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d={svgPaths.p1f2c5400} id="Vector_2" stroke="var(--stroke-0, #71717B)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
        </g>
        <defs>
          <clipPath id="clip0_14_317">
            <rect fill="white" height="16" width="16" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Item12() {
  return (
    <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full" data-name="Item">
      <Svg12 />
      <div className="[word-break:break-word] flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#09090b] text-[13.2px] whitespace-nowrap">
        <p className="leading-[20px] mb-0">Advanced data feeds (earnings, social</p>
        <p className="leading-[20px]">media sentiment, analyst estimates)</p>
      </div>
    </div>
  );
}

function Svg13() {
  return (
    <div className="relative shrink-0 size-[16px]" data-name="SVG">
      <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g clipPath="url(#clip0_14_317)" id="SVG">
          <path d={svgPaths.p34e03900} id="Vector" stroke="var(--stroke-0, #71717B)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d={svgPaths.p1f2c5400} id="Vector_2" stroke="var(--stroke-0, #71717B)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
        </g>
        <defs>
          <clipPath id="clip0_14_317">
            <rect fill="white" height="16" width="16" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Item13() {
  return (
    <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full" data-name="Item">
      <Svg13 />
      <div className="[word-break:break-word] flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#09090b] text-[13.2px] whitespace-nowrap">
        <p className="leading-[20px]">Early access to new features</p>
      </div>
    </div>
  );
}

function List2() {
  return (
    <div className="relative shrink-0 w-full" data-name="List">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[8px] items-start relative size-full">
        <Item10 />
        <Item11 />
        <Item12 />
        <Item13 />
      </div>
    </div>
  );
}

function BackgroundBorderShadow2() {
  return (
    <div className="bg-[#fcfcfc] col-3 justify-self-stretch max-w-[1280px] relative rounded-[18px] row-1 self-start shrink-0" data-name="Background+Border+Shadow">
      <div className="max-w-[inherit] overflow-clip rounded-[inherit] size-full">
        <div className="content-stretch flex flex-col gap-[24px] items-start max-w-[inherit] pb-[69px] pt-[33px] px-[33px] relative size-full">
          <Separator4 />
          <Container15 />
          <List2 />
          <div className="absolute bg-[rgba(251,146,60,0.7)] blur-[36px] h-[128px] left-[0.28%] max-w-[960px] right-[0.28%] rounded-[122.17px] top-[-127px]" data-name="Overlay+Blur" />
        </div>
      </div>
      <div aria-hidden className="absolute border border-[#e4e4e7] border-solid inset-0 pointer-events-none rounded-[18px] shadow-[0px_20px_25px_-5px_rgba(0,0,0,0.03),0px_8px_10px_-6px_rgba(0,0,0,0.03)]" />
    </div>
  );
}

function Container4() {
  return (
    <div className="gap-x-[32px] gap-y-[32px] grid grid-cols-[repeat(3,minmax(0,1fr))] grid-rows-[_555px] h-[555px] relative shrink-0 w-full" data-name="Container">
      <BackgroundBorderShadow />
      <BackgroundBorderShadow1 />
      <BackgroundBorderShadow2 />
    </div>
  );
}

function Container() {
  return (
    <div className="content-stretch flex flex-col gap-[48px] items-center max-w-[1152px] relative shrink-0 w-full" data-name="Container">
      <Paragraph />
      <Container1 />
      <Container4 />
    </div>
  );
}

export default function Section() {
  return (
    <div className="bg-[#f8f7f7] content-stretch flex flex-col items-start px-[384px] py-[128px] relative size-full" data-name="Section">
      <Container />
    </div>
  );
}