export function getJsonFlashcardImportPrompt(context: {
  collectionName: string | null | undefined;
  deckName: string;
}): string {
  const collectionName = context.collectionName?.trim() || "Không thuộc Collection";

  return `Bạn tạo flashcard tiếng Anh cho WordNest.

Context hiện tại:
- Collection: ${collectionName}
- Deck: ${context.deckName}

Tên Collection và Deck chỉ là metadata tham khảo; không được dùng chúng để suy đoán domain, nghĩa hoặc ngữ cảnh sử dụng.

Tôi sẽ gửi danh sách từ bằng dấu ; hoặc xuống dòng, và có thể kèm context cho từng từ. Chuyển TOÀN BỘ danh sách đó thành đúng một JSON hợp lệ. Chỉ trả JSON thuần: không markdown, không code fence, không giải thích, không có bất kỳ text nào trước hoặc sau JSON.

JSON contract (schemaVersion phải là 1):
{
  "schemaVersion": 1,
  "cards": [
    {
      "term": "English word or phrase",
      "meaningVi": "Vietnamese meaning",
      "partOfSpeech": "noun | verb | adjective | adverb | preposition | conjunction | phrase | phrasal verb | idiom | other | null",
      "ipa": "/IPA/ or null",
      "definitionEn": "simple English definition or null",
      "exampleEn": "natural English example or null",
      "exampleVi": "Vietnamese translation of exampleEn or null",
      "cefr": "A1 | A2 | B1 | B2 | C1 | C2 | null",
      "imageUrl": "https://... or null"
    }
  ]
}

Required fields: term, meaningVi.
Optional and nullable fields: partOfSpeech, ipa, definitionEn, exampleEn, exampleVi, cefr, imageUrl.

CORE RULE: 1 flashcard = 1 sense = 1 part of speech.
- Mỗi card chỉ biểu diễn một nghĩa cụ thể, một part of speech, và một cách dùng nhất quán.
- term, meaningVi, partOfSpeech, definitionEn, exampleEn, exampleVi và imageUrl (nếu có) phải cùng đúng một sense.
- Không gộp noun với verb, hoặc hai nghĩa khác nhau, vào cùng một card.
- Với term đa nghĩa hoặc đa POS: User-provided context có priority cao nhất. Nếu không có context, chọn một nghĩa phổ biến, tự nhiên và hữu ích nhất; không liệt kê nhiều nghĩa để thay thế cho việc chọn sense.

Ví dụ về consistency cho "access":
Đúng — verb:
{
  "term": "access",
  "meaningVi": "truy cập",
  "partOfSpeech": "verb",
  "definitionEn": "to open, use, or reach information or a place",
  "exampleEn": "You can access the building through the main entrance.",
  "exampleVi": "Bạn có thể vào tòa nhà qua lối vào chính."
}
Đúng — noun:
{
  "term": "access",
  "meaningVi": "quyền truy cập",
  "partOfSpeech": "noun",
  "definitionEn": "the right or ability to use or enter something",
  "exampleEn": "Only members have access to this area.",
  "exampleVi": "Chỉ thành viên mới có quyền truy cập khu vực này."
}
Không được trộn meaningVi "truy cập; quyền truy cập", POS noun, và ví dụ dùng access như verb trong cùng một card.

Quy tắc nội dung:
- Giữ nguyên term mà tôi gửi: không thay bằng synonym, không tự đổi singular/plural, và giữ nguyên toàn bộ phrase, phrasal verb hoặc idiom.
- meaningVi ngắn gọn, tự nhiên, đúng sense và POS đang học. Chỉ dùng ";" cho các cách diễn đạt gần như cùng một sense và cùng POS; ưu tiên một nghĩa rõ ràng.
- partOfSpeech phải khớp chính xác với cách term được dùng trong exampleEn. Hãy tự kiểm tra điều này trước khi output.
- ipa: chỉ điền khi chắc chắn; nếu phát âm thay đổi theo POS/sense thì theo POS/sense đã chọn; nếu không chắc, null.
- definitionEn: simple English, ngắn, không quá học thuật, và chỉ định nghĩa sense hiện tại.
- exampleEn: tự nhiên, ngắn hoặc trung bình, thể hiện rõ sense và dùng đúng POS.
- exampleVi phải là bản dịch của chính exampleEn, không phải một câu khác; nếu không chắc về cặp ví dụ, đặt cả exampleEn và exampleVi là null.
- cefr chỉ là A1, A2, B1, B2, C1 hoặc C2. Nếu không chắc, null.

Natural, domain-neutral generation:
- Nếu user không cung cấp context/domain: KHÔNG mặc định IT, business, TOEIC, academic hoặc workplace. Không kéo các example về cùng một chủ đề.
- Khi không có context, chọn nghĩa phổ biến, tự nhiên, trung lập; definition đơn giản và example đời thường, dễ hiểu.
- Ví dụ: với "capacity", có thể chọn sense sức chứa: "The theater has a seating capacity of 800 people." Không tự dùng ví dụ server.
- Với "provider", có thể dùng service provider nói chung; với "display" hoặc "run", chọn sense phổ biến và trung lập, không mặc định là màn hình máy tính hoặc chạy chương trình.
- Chỉ khi user cung cấp context/domain rõ ràng thì definition, exampleEn, exampleVi và imageUrl mới bám theo đúng context đó.

Context và polysemy:
- Tôi có thể gửi "bank | bờ sông" hoặc "bank" rồi kèm "Context: We sat on the bank beside the river." Khi có context, meaningVi, partOfSpeech, definitionEn, exampleEn, exampleVi và imageUrl đều phải theo đúng context đó, không quay về nghĩa phổ biến khác.

Image policy:
- imageUrl vẫn là optional. "No image is better than a wrong or irrelevant image."
- Chỉ thêm imageUrl nếu ảnh thực sự giúp nhớ hoặc hiểu đúng sense: thường là đồ vật cụ thể, động vật, cây cối, đồ ăn, xe cộ, dụng cụ, vật thể đặc trưng, hành động/trạng thái dễ nhìn thấy (ví dụ apple, banana, giraffe, microscope, parachute, yawn, shiver, crowded).
- Các khái niệm trừu tượng như perspective, nevertheless, comprehensive, significantly, initiative, responsibility, strategy hoặc relevant thường không cần ảnh.
- Chỉ cung cấp imageUrl nếu bạn có web access và đã xác minh URL là HTTPS, là ảnh thật có thể truy cập, đúng chính sense, ưu tiên ảnh chụp rõ chủ thể.
- Không dùng logo, vocabulary card, dictionary screenshot, infographic, worksheet, icon, vector, silhouette, watermark hoặc ảnh có nhiều chữ.
- Tuyệt đối không bịa URL. Nếu không thể xác minh, imageUrl = null.

Không được output bất kỳ field nội bộ nào ngoài JSON contract, gồm id, deckId, collectionId, status, learningStatus, reviewCount, nextReviewAt, createdAt, updatedAt, visualScore, imageSource, imageSearchQuery, SRS fields, timestamps hoặc field nội bộ khác.

Self-check từng card trước output:
1. term có đúng nguyên văn input không?
2. meaningVi có đúng một sense không?
3. POS có đúng không?
4. definitionEn có cùng sense không?
5. exampleEn có dùng term đúng POS không?
6. exampleVi có dịch đúng exampleEn không?
7. example có tự nhiên và có vô tình bị ép vào một domain không?
8. IPA có chắc chắn không?
9. CEFR có hợp lệ và đủ chắc chắn không?
10. ảnh có thật sự cần không?
11. image URL có được xác minh không?

Sau đó self-check cả batch: JSON parse được, schemaVersion = 1, số card bằng số term đầu vào, không duplicate, không bỏ sót term, không tự thêm term, và không có text ngoài JSON. Tối đa 100 cards.`;
}
