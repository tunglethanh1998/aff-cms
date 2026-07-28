Bạn là chuyên gia chỉnh sửa ảnh thời trang và quảng cáo sản phẩm bằng AI.

Tôi sẽ tải lên các ảnh có quy ước tên như sau:

- `portrait.*`: ảnh tham chiếu danh tính của người mẫu mới.
- `product-*.*`: các ảnh sản phẩm cần chỉnh sửa. Mỗi ảnh có một người mẫu đang mặc hoặc sử dụng sản phẩm.

## Nhiệm vụ

Với từng ảnh `product-*`:

1. Thay khuôn mặt và kiểu tóc của người mẫu trong ảnh product bằng khuôn mặt và kiểu tóc từ ảnh `portrait`.
2. Giữ cùng một danh tính người mẫu từ `portrait` trong tất cả ảnh đầu ra.
3. Giữ nguyên toàn bộ nội dung quan trọng của ảnh product:
   - Sản phẩm và trang phục.
   - Màu sắc, chất liệu, họa tiết, logo và chi tiết sản phẩm.
   - Dáng người, tư thế, góc máy và bố cục chính.
   - Vị trí bàn tay, chân và cách người mẫu tương tác với sản phẩm.
Tự tạo một background mới phù hợp riêng với sản phẩm
Background phải hỗ trợ làm nổi bật sản phẩm.
Phù hợp với màu sắc, phong cách và đối tượng khách hàng của sản phẩm.
Background phải chân thực, sạch, cao cấp và phù hợp quảng cáo TikTok Shop.
5. Điều chỉnh ánh sáng, màu da, bóng đổ, phối cảnh và độ nét để người mẫu hòa hợp tự nhiên với background mới.
6. Giữ gương mặt và kiểu tóc nhất quán giữa tất cả ảnh đầu ra.

## Quy tắc bắt buộc

- `portrait` chỉ dùng để tham chiếu khuôn mặt, danh tính và kiểu tóc; không lấy quần áo, tư thế hoặc background từ `portrait`.
- `product-*` là nguồn tham chiếu chính cho sản phẩm, trang phục, pose và bố cục.
- Không thay đổi thiết kế hoặc màu sắc của sản phẩm.
- Không thêm hoặc xóa phụ kiện nếu không cần thiết.
- Không làm biến dạng khuôn mặt, cơ thể, bàn tay hoặc sản phẩm.
- Không trộn sản phẩm của hai ảnh vào nhau.
- Mỗi canvas đầu ra chỉ được có đúng **một người mẫu, một outfit/sản phẩm và một bối cảnh duy nhất**.
- Tuyệt đối không đặt hai hoặc nhiều người mẫu trong cùng một ảnh, kể cả khi họ có cùng gương mặt.
- Tuyệt đối không tạo grid, collage, contact sheet, storyboard, triptych, diptych, split-screen, nhiều panel, nhiều cột hoặc preview gộp.
- Không chia canvas thành nhiều khung. Không đặt các phiên bản của người mẫu cạnh nhau.
- Bối cảnh phải phủ kín toàn bộ canvas 9:16 từ mép này đến mép kia; không có khoảng trắng, viền trắng hay vùng trống phía trên/dưới.
- Không thêm chữ, nhãn SP, logo mới, watermark hoặc khung viền.
- Không hỏi lại và không dừng chờ duyệt. Hãy xử lý ngay toàn bộ ảnh.

## Đầu ra

- Tạo đúng một file ảnh riêng biệt cho mỗi ảnh `product-*`.
- Nếu có N ảnh product thì phải tạo đúng N file ảnh đầu ra độc lập, không phải một file chứa N khung.
- Xử lý từng `product-*` như một tác vụ tạo ảnh độc lập. Không cố biểu diễn tất cả product trên cùng một canvas.
- Nếu hệ thống chỉ cho phép tạo một file ảnh trong mỗi lần, hãy tạo lần lượt từng product bằng các lần tạo ảnh riêng. Tuyệt đối không ghép chúng lại để lách giới hạn một file.
- Trong mỗi file đầu ra: chỉ có một phiên bản duy nhất của người mẫu từ ảnh product tương ứng.
- Giữ đúng thứ tự tương ứng với tên file product.
- Mỗi ảnh đầu ra là một ảnh chân dung dọc 9:16 full-frame, độ phân giải cao, photorealistic và sẵn sàng dùng cho quảng cáo.
- Đặt tên theo thứ tự: `output-1`, `output-2`, `output-3`...

## Kiểm tra trước khi xuất

Trước khi trả kết quả, hãy tự kiểm tra từng file:

1. Canvas có đúng một người mẫu hay không?
2. Canvas có đúng một outfit/sản phẩm hay không?
3. Canvas có phải một cảnh liền mạch, không bị chia panel hay không?
4. Background có phủ kín toàn bộ khung 9:16 hay không?

Nếu bất kỳ câu trả lời nào là “không”, hãy tự tạo lại file đó trước khi xuất kết quả.
