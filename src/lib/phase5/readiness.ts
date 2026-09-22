export type ReadinessAnswers = { health: number; emotion: number; focus: number; streak: number; plan: number };
export type ReadinessBand = 'green' | 'yellow' | 'red';
export type ReadinessTier = 'A-Game' | 'B-Game' | 'Caution' | 'C-Game';

export interface ReadinessDiagnostic {
  type: 'info' | 'warning' | 'danger';
  title: string;
  message: string;
}

export interface ReadinessEvaluation {
  score: number;
  band: ReadinessBand;
  tier: ReadinessTier;
  tierLabel: string;
  recommendedRisk: string;
  headline: string;
  advice: string;
  actionPoints: string[];
  diagnostics: ReadinessDiagnostic[];
}

export function scoreReadiness(answers: ReadinessAnswers): ReadinessEvaluation {
  const values = Object.values(answers);
  if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 2)) {
    throw new Error('Mỗi câu trả lời phải từ 0 đến 2 điểm.');
  }

  const score = values.reduce((sum, value) => sum + value, 0) * 10;

  // Diagnostics based on individual criteria
  const diagnostics: ReadinessDiagnostic[] = [];

  // 1. Health & Sleep
  if (answers.health === 0) {
    diagnostics.push({
      type: 'danger',
      title: 'Thể lực & Giấc ngủ kém (0/2)',
      message: 'Thiếu ngủ làm chậm thời gian phản xạ và làm giảm tính kiên nhẫn. Tuyệt đối tránh Scalping khung nhỏ (M1/M5), ưu tiên Swing hoặc nghỉ ngơi.',
    });
  } else if (answers.health === 1) {
    diagnostics.push({
      type: 'info',
      title: 'Thể lực trung bình (1/2)',
      message: 'Uống đủ nước và nghỉ mắt 5-10 phút giữa các phiên giao dịch để giữ sự tỉnh táo.',
    });
  }

  // 2. Emotion & Mental State
  if (answers.emotion === 0) {
    diagnostics.push({
      type: 'danger',
      title: 'Tâm lý báo động đỏ (0/2)',
      message: 'Đang có tâm lý tức giận, lo âu hoặc muốn gỡ lỗ (revenge trading). Tuyệt đối không vào lệnh khi lý trí bị cảm xúc lấn át.',
    });
  } else if (answers.emotion === 1) {
    diagnostics.push({
      type: 'info',
      title: 'Tâm trạng trung tính (1/2)',
      message: 'Tâm lý ổn định, không phấn khích quá đà. Đặt lệnh Limit/Stop theo kế hoạch, không đuổi nến Market.',
    });
  }

  // 3. Focus
  if (answers.focus === 0) {
    diagnostics.push({
      type: 'warning',
      title: 'Phân tâm / Thiếu tập trung (0/2)',
      message: 'Đầu óc nhiều việc chi phối dễ dẫn đến bỏ sót tín hiệu hoặc trễ lệnh. Đặt Alerts giá thay vì dán mắt vào chart liên tục.',
    });
  } else if (answers.focus === 1) {
    diagnostics.push({
      type: 'info',
      title: 'Tập trung vừa phải (1/2)',
      message: 'Đóng các tab mạng xã hội và tắt thông báo điện thoại trong giờ giao dịch chính.',
    });
  }

  // 4. Streak / Recency Bias
  if (answers.streak === 0) {
    diagnostics.push({
      type: 'warning',
      title: 'Áp lực chuỗi thua gần đây (0/2)',
      message: 'Nhớ nguyên lý Mark Douglas: Mỗi lệnh là một biến cố xác suất độc lập. Đừng để lệnh trước làm lệch quyết định lệnh sau.',
    });
  } else if (answers.streak === 2) {
    diagnostics.push({
      type: 'info',
      title: 'Đang trong chuỗi kết quả tốt (2/2)',
      message: 'Tâm lý tốt, nhưng hãy cảnh giác bẫy tự mãn (Overconfidence). Luôn duy trì khối lượng chuẩn, không tăng rủi ro tùy hứng.',
    });
  }

  // 5. Plan
  if (answers.plan === 0) {
    diagnostics.push({
      type: 'danger',
      title: 'Chưa có kế hoạch giao dịch (0/2)',
      message: 'Vào lệnh không kế hoạch đồng nghĩa với đánh cược may rủi. Hãy chuẩn bị kịch bản trước khi mở chart.',
    });
  } else if (answers.plan === 1) {
    diagnostics.push({
      type: 'warning',
      title: 'Kế hoạch chưa chi tiết (1/2)',
      message: 'Hãy ghi rõ mức Entry, Stop Loss, Take Profit cụ thể và điều kiện hủy setup vào nhật ký trước khi vào lệnh.',
    });
  }

  // Critical Red Flags: Emotion = 0 (Tilt/Revenge)
  if (answers.emotion === 0) {
    return {
      score,
      band: 'red',
      tier: 'C-Game',
      tierLabel: 'C-Game: Nguy cơ Tilt cao',
      recommendedRisk: '0% — Dừng giao dịch hôm nay (No-Trade Day)',
      headline: 'Cảnh báo cảm xúc: Nguy cơ trả thù thị trường hoặc FOMO',
      advice: 'Theo Jared Tendler, đây là trạng thái C-Game điển hình — não bộ phần cảm xúc đang chi phối lý trí. Việc mở vị thế lúc này có xác suất phá vỡ kỷ luật và gia tăng thua lỗ rất cao.',
      actionPoints: [
        'Đóng biểu đồ và tạm rời khỏi bàn làm việc để ngắt chu kỳ kích thích tâm lý.',
        'Ghi chép nhanh cảm xúc hiện tại vào nhật ký (nguyên nhân gây bực bội/muốn gỡ).',
        'Vận động nhẹ, đi dạo hoặc nghỉ ngơi để thiết lập lại trạng thái cân bằng.',
      ],
      diagnostics,
    };
  }

  // Critical Red Flags: Plan = 0 (Unplanned gambling)
  if (answers.plan === 0) {
    return {
      score,
      band: 'red',
      tier: 'C-Game',
      tierLabel: 'C-Game: Thiếu kế hoạch tác chiến',
      recommendedRisk: '0% — Chưa được phép giao dịch',
      headline: 'Chưa chuẩn bị kịch bản: Giao dịch lúc này là đánh cược may rủi',
      advice: 'Mark Douglas khẳng định: Trader chuyên nghiệp luôn định nghĩa trước rủi ro và điều kiện thị trường. Không có kế hoạch cụ thể thì không có cơ sở để đo lường lợi thế (Edge).',
      actionPoints: [
        'Tuyệt đối không vào lệnh ngẫu hứng theo cảm tính thị trường.',
        'Mở khung D1/H4 xác định xu hướng chính và vẽ các vùng hỗ trợ/kháng cự then chốt.',
        'Chỉ mở lệnh khi đã có kịch bản Entry, SL, TP rõ ràng trong Playbook.',
      ],
      diagnostics,
    };
  }

  // Overall Score < 50
  if (score < 50) {
    return {
      score,
      band: 'red',
      tier: 'C-Game',
      tierLabel: 'C-Game: Năng lượng suy giảm',
      recommendedRisk: '0% (hoặc tối đa 25% trên Demo/Replay)',
      headline: 'Dưới ngưỡng an toàn: Ưu tiên bảo toàn vốn và thể lực',
      advice: 'Tổng thể trạng thái hôm nay không thuận lợi cho việc ra quyết định tài chính. Bảo vệ vốn của bạn khỏi những ngày phong độ thấp là chìa khóa để tồn tại dài hạn trên thị trường.',
      actionPoints: [
        'Xem hôm nay là ngày quan sát thị trường (Observation Day).',
        'Chỉ quan sát phản ứng giá hoặc luyện tập trên tài khoản Replay.',
        'Nghỉ ngơi sớm để hồi phục thể lực cho phiên giao dịch ngày mai.',
      ],
      diagnostics,
    };
  }

  // 80 - 100: A-Game
  if (score >= 80) {
    return {
      score,
      band: 'green',
      tier: 'A-Game',
      tierLabel: 'A-Game: Đỉnh cao phong độ',
      recommendedRisk: '100% Khối lượng chuẩn theo kế hoạch',
      headline: 'Trạng thái dòng chảy (Flow State): Sẵn sàng thực thi xuất sắc',
      advice: 'Tâm trí sáng suốt, thể lực dồi dào và kế hoạch chuẩn bị kỹ càng. Bạn đang ở phong độ A-Game tốt nhất để phát huy tối đa lợi thế giao dịch.',
      actionPoints: [
        'Tự tin bóp cò khi xuất hiện setup A+ theo đúng tiêu chuẩn Playbook.',
        'Kiên nhẫn gồng lệnh đến mục tiêu TP đã định, tránh can thiệp vi mô (micromanaging).',
        'Ghi chú nhật ký giao dịch ngay khi hoàn tất lệnh để duy trì phong độ.',
      ],
      diagnostics,
    };
  }

  // 70 - 79: B-Game
  if (score >= 70) {
    return {
      score,
      band: 'green',
      tier: 'B-Game',
      tierLabel: 'B-Game: Sẵn sàng thực chiến',
      recommendedRisk: '100% Khối lượng chuẩn (Ưu tiên setup A+)',
      headline: 'Trạng thái B-Game ổn định: Giữ nguyên khối lượng, siết chặt kỷ luật chọn lệnh',
      advice: 'Điểm số 70-79 thể hiện bạn hoàn toàn đủ điều kiện giao dịch thực chiến. Trong tâm lý học giao dịch (Jared Tendler), B-Game là trạng thái vận hành bền vững của trader. Bạn KHÔNG cần cắt giảm khối lượng khi kế hoạch đã rõ ràng, nhưng cần nâng cao tính chọn lọc và loại bỏ các setup rủi ro.',
      actionPoints: [
        'Giữ nguyên 100% khối lượng chuẩn nhưng CHỈ giao dịch setup A+ đẹp nhất, bỏ qua các setup hạng B hoặc lưng chừng.',
        'Ưu tiên dùng lệnh chờ (Limit/Stop) tại vùng cản then chốt, không fomo vào lệnh Market.',
        'Đặt mức dừng lỗ (Stop Loss) cứng ngay khi vào lệnh và không bao giờ nới rộng SL.',
        'Giới hạn tối đa 2-3 lệnh trong ngày để bảo toàn năng lượng và tránh trượt sang C-Game.',
      ],
      diagnostics,
    };
  }

  // 50 - 69: Caution / Thận trọng
  return {
    score,
    band: 'yellow',
    tier: 'Caution',
    tierLabel: 'Vùng Cảnh giác: Cần thận trọng',
    recommendedRisk: '50% — 70% Khối lượng chuẩn',
    headline: 'Phong độ trung bình: Giảm nhẹ rủi ro để giải tỏa áp lực tâm lý',
    advice: 'Năng lượng hoặc sự tập trung đang có dấu hiệu phân tán nhẹ. Việc chủ động giảm khối lượng xuống 50-70% giúp giảm nhẹ áp lực tài chính, duy trì tâm lý thoải mái và bảo vệ tài khoản khi thị trường nhiễu động.',
    actionPoints: [
      'Chủ động hạ rủi ro xuống 50% - 70% khối lượng thường dùng.',
      'Yêu cầu tối thiểu 2 khung thời gian đồng thuận trước khi quyết định vào lệnh.',
      'Nếu lệnh đầu tiên chạm Stop Loss, dừng giao dịch trong ngày để đánh giá lại.',
    ],
    diagnostics,
  };
}

export function localDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (name: string) => parts.find((item) => item.type === name)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
