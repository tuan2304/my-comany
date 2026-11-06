/**
 * Công cụ của công ty cấp cho Trưởng nhóm và Giám đốc qua MCP. Agent không tự do
 * gọi nhau: mọi giao việc và duyệt bài đều đi qua các công cụ này, nên được ghi lại, kiểm soát
 * (giới hạn tải, trùng phạm vi, số lần trả bài, đợt làm lại) và hiện lên giao diện.
 *
 * Mỗi công cụ chỉ dùng được ở một số loại lượt làm việc (kind):
 *   plan (Trưởng nhóm lập kế hoạch), review (Trưởng nhóm duyệt bài),
 *   dplan (Giám đốc lập kế hoạch), dreview (Giám đốc kiểm tra kết quả).
 * Nhân viên (kind work) chỉ có các công cụ hỏi (ask_lead, ask_colleague, call_meeting); bài nộp vẫn là báo cáo cuối của họ.
 * `run` nhận ctx = { jobs, epics, questions }, lượt làm việc (task) và tham số.
 */

export const TOOLS = {
  get_team_workload: {
    kinds: ['plan'],
    description:
      'Xem tải hiện tại của từng nhân viên trong team: ai đang làm gì, ai còn chỗ nhận thêm việc, thế mạnh và model của mỗi người. ' +
      'Hãy gọi trước khi giao việc để chọn đúng người và tránh giao quá tải.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: (ctx, task) => ctx.jobs.describeWorkload(task),
  },
  assign_to_member: {
    kinds: ['plan'],
    description:
      'Giao MỘT việc con cho MỘT nhân viên. Việc con phải tự chứa đủ thông tin để người nhận làm mà không cần hỏi lại. ' +
      'Hệ thống từ chối nếu người đó đã đủ việc, nếu phạm vi file chồng lấn với việc con khác của cùng việc lớn, hoặc nếu đã đủ số việc con tối đa.',
    inputSchema: {
      type: 'object',
      properties: {
        member: { type: 'string', description: 'Tên nhân viên nhận việc (lấy từ get_team_workload).' },
        title: { type: 'string', description: 'Tiêu đề ngắn của việc con, duy nhất trong việc lớn.' },
        description: { type: 'string', description: 'Mô tả đầy đủ: làm gì, ở đâu, hành vi mong muốn, ràng buộc.' },
        acceptance: { type: 'string', description: 'Tiêu chí hoàn thành kiểm chứng được, ví dụ "npm test chạy qua và có test cho X".' },
        files: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          description: 'Các file hoặc thư mục (tính từ gốc dự án) mà việc con này sẽ sửa. Không được chồng lấn với việc con khác.',
        },
        level: {
          type: 'string',
          enum: ['auto', 'easy', 'normal', 'hard'],
          description: 'Độ khó nếu bạn chắc chắn: easy (cơ học, nhỏ), normal, hard (cần suy nghĩ sâu). Bỏ trống hoặc auto để hệ thống tự đánh giá.',
        },
      },
      required: ['member', 'title', 'description', 'files'],
      additionalProperties: false,
    },
    run: (ctx, task, args) => ctx.jobs.assign(task, args),
  },
  review_submission: {
    kinds: ['review'],
    description:
      'Đưa ra kết luận cho bài nộp đang được duyệt. Chỉ gọi MỘT lần. approve nếu đạt; reject kèm nhận xét cụ thể, làm theo được, ' +
      'để nhân viên sửa. Số lần được trả bài có giới hạn.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'integer', description: 'Số của việc đang duyệt (ghi ở đầu yêu cầu).' },
        verdict: { type: 'string', enum: ['approve', 'reject'] },
        feedback: { type: 'string', description: 'Nhận xét. Bắt buộc khi reject: nêu từng điểm cần sửa.' },
      },
      required: ['task_id', 'verdict'],
      additionalProperties: false,
    },
    run: (ctx, task, args) => ctx.jobs.review(task, args),
  },

  // ---- Nhân viên làm việc: hỏi người khác khi vướng thật ----
  ask_lead: {
    kinds: ['work'],
    description:
      'Hỏi Trưởng nhóm của bạn MỘT câu khi vướng thật (đề bài mâu thuẫn, thiếu thông tin mà không đoán được từ code). ' +
      'Không dùng để thăm dò hay xin duyệt. Sau khi gọi, hãy KẾT THÚC lượt này ngay bằng một câu ngắn; hệ thống sẽ gọi bạn lại cùng câu trả lời. ' +
      'Mỗi việc chỉ được hỏi tối đa 2 lần.',
    inputSchema: {
      type: 'object',
      properties: { question: { type: 'string', description: 'Câu hỏi cụ thể, tự chứa đủ bối cảnh, tối đa 600 ký tự.' } },
      required: ['question'],
      additionalProperties: false,
    },
    run: (ctx, task, args) => ctx.questions.ask(task, { kind: 'lead', question: args.question }),
  },
  ask_colleague: {
    kinds: ['work'],
    description:
      'Hỏi MỘT đồng nghiệp trong cùng team khi cần biết điều người đó nắm rõ hơn (code họ phụ trách, quy ước họ đã chọn). ' +
      'Người đó chỉ đọc code và trả lời, không làm thay bạn. Sau khi gọi, hãy KẾT THÚC lượt này ngay bằng một câu ngắn; hệ thống sẽ gọi bạn lại cùng câu trả lời.',
    inputSchema: {
      type: 'object',
      properties: {
        member: { type: 'string', description: 'Tên đồng nghiệp trong cùng team.' },
        question: { type: 'string', description: 'Câu hỏi cụ thể, tự chứa đủ bối cảnh, tối đa 600 ký tự.' },
      },
      required: ['member', 'question'],
      additionalProperties: false,
    },
    run: (ctx, task, args) => ctx.questions.ask(task, { kind: 'colleague', member: args.member, question: args.question }),
  },
  call_meeting: {
    kinds: ['work'],
    description:
      'Họp ngắn: hỏi cùng một câu cho Trưởng nhóm và tối đa 2 đồng nghiệp cùng team, mỗi người trả lời riêng. Chỉ dùng cho quyết định ảnh hưởng nhiều người ' +
      '(đổi cách làm chung, xung đột phạm vi). Sau khi gọi, hãy KẾT THÚC lượt này ngay bằng một câu ngắn. Tính là một lần hỏi.',
    inputSchema: {
      type: 'object',
      properties: { question: { type: 'string', description: 'Vấn đề cần họp, cụ thể, tối đa 600 ký tự.' } },
      required: ['question'],
      additionalProperties: false,
    },
    run: (ctx, task, args) => ctx.questions.ask(task, { kind: 'meeting', question: args.question }),
  },

  // ---- Giám đốc ----
  get_company_overview: {
    kinds: ['dplan', 'dreview'],
    description:
      'Xem các team của công ty: Trưởng nhóm, nhân viên, thế mạnh, tải hiện tại, giới hạn, và các việc đã tạo cho yêu cầu này. Gọi trước khi giao việc cho team.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: (ctx, task) => ctx.epics.describeOverview(task),
  },
  set_contract: {
    kinds: ['dplan'],
    description:
      'Chốt HỢP ĐỒNG CHUNG của yêu cầu khi nó cắt ngang nhiều team (đường dẫn và phương thức API, dữ liệu vào ra dạng JSON, mã lỗi, quy tắc xác thực, quy ước). ' +
      'Hợp đồng được đính kèm vào mọi việc của các team để Backend và Frontend làm song song mà vẫn khớp nhau. Gọi một lần, trước khi tạo việc cho team.',
    inputSchema: {
      type: 'object',
      properties: { contract: { type: 'string', description: 'Nội dung hợp đồng, cụ thể và đầy đủ.' } },
      required: ['contract'],
      additionalProperties: false,
    },
    run: (ctx, task, args) => ctx.epics.setContract(task, args),
  },
  create_team_job: {
    kinds: ['dplan', 'dreview'],
    description:
      'Giao một việc cho MỘT team (không phải một người: Trưởng nhóm sẽ tự chia nhỏ). Khi lập kế hoạch, việc được tạo ở dạng nháp và chỉ chạy sau khi chủ duyệt kế hoạch. ' +
      'Khi kiểm tra kết quả, dùng để giao việc sửa lỗi (chỉ một đợt) và việc bắt đầu ngay trên mã đã ghép. ' +
      'depends_on là tiêu đề các việc phải xong và được ghép trước khi việc này bắt đầu (ví dụ việc test của team Chất lượng phụ thuộc việc của Backend và Frontend).',
    inputSchema: {
      type: 'object',
      properties: {
        team: { type: 'string', description: 'id hoặc tên team (xem get_company_overview).' },
        title: { type: 'string', description: 'Tiêu đề ngắn, duy nhất trong yêu cầu.' },
        description: { type: 'string', description: 'Mục tiêu, phạm vi, ràng buộc của việc cho team.' },
        acceptance: { type: 'string', description: 'Tiêu chí hoàn thành kiểm chứng được.' },
        depends_on: { type: 'array', items: { type: 'string' }, description: 'Tiêu đề các việc đã tạo mà việc này phải chờ.' },
      },
      required: ['team', 'title', 'description'],
      additionalProperties: false,
    },
    run: (ctx, task, args) => ctx.epics.createTeamJob(task, args),
  },
  finish_epic: {
    kinds: ['dreview'],
    description:
      'Kết luận sau khi kiểm tra kết quả. accept: đạt, gửi báo cáo cho chủ duyệt. attention: chưa đạt và không còn lượt làm lại, cần chủ xem. ' +
      'Không gọi nếu bạn vừa giao việc làm lại.',
    inputSchema: {
      type: 'object',
      properties: {
        verdict: { type: 'string', enum: ['accept', 'attention'] },
        report: { type: 'string', description: 'Báo cáo cho chủ bằng tiếng Việt: đã làm gì, team nào làm, kiểm chứng ra sao, còn gì dang dở.' },
      },
      required: ['verdict', 'report'],
      additionalProperties: false,
    },
    run: (ctx, task, args) => ctx.epics.finish(task, args),
  },
};

export function toolsForKind(kind) {
  return Object.entries(TOOLS)
    .filter(([, def]) => def.kinds.includes(kind))
    .map(([name, def]) => ({ name, description: def.description, inputSchema: def.inputSchema }));
}

/** Tên đầy đủ mà Claude Code đặt cho công cụ MCP (máy chủ MCP tên "company"). */
export const mcpName = (tool) => `mcp__company__${tool}`;
