# Apple-Style Design System Guidelines

## 1. Core Philosophy
- **Minimalism**: 불필요한 장식 요소(그라데이션, 화려한 패턴)를 배제하고 핵심 콘텐츠와 기능에 집중한다.
- **Negative Space**: 넓은 여백을 사용하여 시각적 안정감과 고급스러움을 부여한다. 화면을 텍스트나 요소로 가득 채우지 않는다.
- **Clarity**: 콘텐츠의 가독성을 최우선으로 하며, 크기와 대비를 통해 명확한 정보 계층 구조를 구축한다.

## 2. Typography
- **Primary Font**: San Francisco (SF Pro) / 가상 환경이나 웹에서 지원하지 않을 경우 `Helvetica Neue`, `Arial`, `sans-serif`로 폴백(Fallback) 지정.
- **Font Scale & Hierarchy**:
  - **Hero Title (웹 H1 / PPT 커버 제목)**: 48px~60px 이상, Font-weight: 700 (Bold), Letter-spacing: -0.02em.
  - **Section Title (웹 H2 / PPT 본문 제목)**: 32px~40px, Font-weight: 600 (Semi-Bold), Letter-spacing: -0.015em.
  - **Body Text (웹 p / PPT 본문)**: 16px~20px, Font-weight: 400 (Regular), Line-height: 1.5.
  - **Caption/Detail**: 12px~14px, Font-weight: 400, 색상을 Secondary 텍스트 컬러로 지정.

## 3. Color Palette
- **Light Theme**:
  - Background: `#FFFFFF` (순백색) 또는 `#F5F5F7` (아주 옅은 회색, 전체 래퍼용)
  - Primary Text: `#1D1D1F` (완전한 검은색이 아닌 짙은 회색빛 검정)
  - Secondary Text: `#86868B`
  - Accent / Action: `#007AFF` (Apple Blue)
  - Border / Divider: `#E5E5EA`
- **Dark Theme (선택 사항)**:
  - Background: `#000000` (순수 검정) 또는 `#1C1C1E` (카드/컨테이너 배경)
  - Primary Text: `#F5F5F7`
  - Secondary Text: `#98989D`
  - Accent / Action: `#0A84FF`
  - Border / Divider: `#38383A`

## 4. UI Components & Shapes (General)
- **Corner Radius**: 모든 컨테이너, 카드, 버튼의 모서리는 둥글게 처리한다. 기본 반경은 `12px` (작은 요소는 `8px`, 큰 카드는 `16px`). 직각 모서리는 사용하지 않는다.
- **Drop Shadow**: 진하고 뚜렷한 그림자 대신, 투명도가 높고 부드럽게 퍼지는 그림자를 사용한다.
  - CSS 예시: `box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);`
- **Buttons**:
  - Primary: Background `#007AFF`, Text `#FFFFFF`, Border-radius `12px`, Font-weight `600`, Border none.
  - Secondary: Background `#F2F2F7`, Text `#007AFF`, Border-radius `12px`, Font-weight `600`.

## 5. Specific Guidelines for PowerPoint (.pptx)
- **Slide Layout**: 16:9 와이드스크린 비율.
- **Margins**: 슬라이드 가장자리에서 최소 1인치(약 2.54cm) 이상의 여백을 둔다.
- **Content Density**: 슬라이드 당 하나의 핵심 메시지만 배치한다. 텍스트는 3~4줄을 넘기지 않으며, 불릿 포인트(Bullet points) 사용을 최소화한다.
- **Imagery**: 고해상도 전체 화면 이미지를 적극 활용한다. 이미지 위에 텍스트를 올릴 경우, 텍스트 가독성을 위해 이미지 배경에 어두운 반투명 오버레이를 적용한다.
- **Transitions**: 슬라이드 전환은 '모핑(Morph)' 또는 단순 '밝기 변화(Fade)'만 사용한다. 화려한 애니메이션은 금지한다.

## 6. Specific Guidelines for GAS Web App (HTML/CSS)
- **Layout Structure**: 전체 화면 너비를 쓰기보다, 화면 중앙에 정렬된 최대 너비 `800px` 내외의 메인 컨테이너(카드 형태)를 사용한다.
- **Glassmorphism (블러 효과)**: 상단 네비게이션 바나 고정 헤더에는 반투명 배경과 블러 효과를 적용한다.
  - CSS 예시: `background-color: rgba(255, 255, 255, 0.8); backdrop-filter: blur(20px);`
- **Form Controls / Inputs**:
  - 배경색은 `#F2F2F7`, 테두리 없음(Border none), 둥근 모서리 `8px`.
  - 입력창 포커스 시(Focus state): 아웃라인 대신 `#007AFF` 색상의 미세한 테두리 하이라이트를 부드럽게(Transition: 0.2s) 나타낸다.
- **Spacing (Padding/Margin)**: 요소 간의 간격은 `16px`, `24px`, `32px`, `48px` 배수로 일관되게 적용하여 시각적 리듬감을 맞춘다.