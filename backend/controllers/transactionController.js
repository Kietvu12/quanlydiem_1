import TransactionModel from '../models/TransactionModel.js'
import UserModel from '../models/UserModel.js'
import LogModel from '../models/LogModel.js'
import pool from '../config/db.js'

class TransactionController {
  // Lấy tất cả giao dịch với pagination
  static async getAll(req, res) {
    try {
      const page = parseInt(req.query.page) || 1
      const limit = parseInt(req.query.limit) || 60
      
      const result = await TransactionModel.getAll(page, limit)
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination
      })
    } catch (error) {
      console.error('Get all transactions error:', error)
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy danh sách giao dịch',
        error: error.message
      })
    }
  }

  // Lấy giao dịch theo ID
  static async getById(req, res) {
    try {
      const { id } = req.params
      const transaction = await TransactionModel.getById(id)

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy giao dịch'
        })
      }

      res.json({
        success: true,
        data: transaction
      })
    } catch (error) {
      console.error('Get transaction by ID error:', error)
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy thông tin giao dịch',
        error: error.message
      })
    }
  }

  // Lấy giao dịch của người dùng với pagination
  static async getByUserId(req, res) {
    try {
      const { userId } = req.params
      const page = parseInt(req.query.page) || 1
      const limit = parseInt(req.query.limit) || 60
      
      const result = await TransactionModel.getByUserId(userId, page, limit)

      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination
      })
    } catch (error) {
      console.error('Get transactions by user ID error:', error)
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy giao dịch của người dùng',
        error: error.message
      })
    }
  }

  // Tạo giao dịch mới
  static async create(req, res) {
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()

      const { id_nguoi_gui, id_nguoi_nhan, id_loai_giao_dich, so_diem_giao_dich, id_giao_dich_doi_chung, noi_dung_giao_dich } = req.body

      // Validate
      if (!id_nguoi_gui || !id_nguoi_nhan || !id_loai_giao_dich || so_diem_giao_dich === undefined) {
        await connection.rollback()
        return res.status(400).json({
          success: false,
          message: 'Thiếu thông tin bắt buộc'
        })
      }

      if (id_nguoi_gui === id_nguoi_nhan) {
        await connection.rollback()
        return res.status(400).json({
          success: false,
          message: 'Người gửi và người nhận không thể là cùng một người'
        })
      }

      // Lấy thông tin loại giao dịch
      const loaiGiaoDich = await TransactionModel.getLoaiGiaoDichById(id_loai_giao_dich)
      if (!loaiGiaoDich) {
        await connection.rollback()
        return res.status(400).json({
          success: false,
          message: 'Loại giao dịch không hợp lệ'
        })
      }

      // Lấy thông tin người dùng
      const nguoiGui = await UserModel.getById(id_nguoi_gui)
      const nguoiNhan = await UserModel.getById(id_nguoi_nhan)

      if (!nguoiGui || !nguoiNhan) {
        await connection.rollback()
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy người dùng'
        })
      }

      // Biến để lưu giá trị cuối cùng cho việc tạo giao dịch
      let finalIdNguoiGui = id_nguoi_gui
      let finalIdNguoiNhan = id_nguoi_nhan
      let finalSoDiem = parseFloat(so_diem_giao_dich)

      let diemNguoiGui = parseFloat(nguoiGui.so_diem)
      let diemNguoiNhan = parseFloat(nguoiNhan.so_diem)

      // Xử lý logic theo loại giao dịch
      const tenLoai = loaiGiaoDich.ten_loai_giao_dich

      if (tenLoai === 'Giao lịch') {
        // Giao dịch "Giao lịch" mới tạo có trạng thái "chua_chot", KHÔNG cộng/trừ điểm
        // Điểm sẽ được cộng/trừ khi chuyển sang trạng thái "da_chot"
        // Không thay đổi điểm của người gửi và người nhận
      } else if (tenLoai === 'San điểm') {
        // Người nhận được cộng điểm, người gửi bị trừ điểm
        diemNguoiNhan += parseFloat(so_diem_giao_dich)
        diemNguoiGui -= parseFloat(so_diem_giao_dich)
      } else if (tenLoai === 'Hủy lịch') {
        // Đảo ngược lại giao dịch nhận lịch với id_giao_dich_doi_chung
        if (!id_giao_dich_doi_chung) {
          await connection.rollback()
          return res.status(400).json({
            success: false,
            message: 'Giao dịch hủy lịch cần có id_giao_dich_doi_chung'
          })
        }

        // Lấy giao dịch đối chứng
        const giaoDichDoiChung = await TransactionModel.getById(id_giao_dich_doi_chung)
        if (!giaoDichDoiChung) {
          await connection.rollback()
          return res.status(404).json({
            success: false,
            message: 'Không tìm thấy giao dịch đối chứng'
          })
        }

        // Kiểm tra giao dịch đối chứng phải là "Giao lịch"
        if (giaoDichDoiChung.ten_loai_giao_dich !== 'Giao lịch') {
          await connection.rollback()
          return res.status(400).json({
            success: false,
            message: 'Giao dịch đối chứng phải là loại "Giao lịch"'
          })
        }

        // Lấy thông tin từ giao dịch đối chứng
        // Trong giao dịch "Giao lịch":
        // - id_nguoi_gui = người giao lịch (đã được cộng điểm)
        // - id_nguoi_nhan = người nhận lịch (đã bị trừ điểm)
        const idNguoiGiaoLich = giaoDichDoiChung.id_nguoi_gui // Người giao lịch (cần trừ điểm)
        const idNguoiNhanLich = giaoDichDoiChung.id_nguoi_nhan // Người nhận lịch (cần hoàn lại điểm)
        const soDiemHuy = parseFloat(giaoDichDoiChung.so_diem_giao_dich) // Số điểm từ giao dịch đối chứng

        // Lấy thông tin người dùng từ giao dịch đối chứng
        const nguoiGiaoLich = await UserModel.getById(idNguoiGiaoLich)
        const nguoiNhanLich = await UserModel.getById(idNguoiNhanLich)

        if (!nguoiGiaoLich || !nguoiNhanLich) {
          await connection.rollback()
          return res.status(404).json({
            success: false,
            message: 'Không tìm thấy người dùng từ giao dịch đối chứng'
          })
        }

        // Hoàn lại điểm cho người nhận lịch (người đã bị trừ điểm trong giao dịch "Giao lịch")
        // Trừ điểm của người giao lịch (người đã được cộng điểm trong giao dịch "Giao lịch")
        let diemNguoiGiaoLich = parseFloat(nguoiGiaoLich.so_diem)
        let diemNguoiNhanLich = parseFloat(nguoiNhanLich.so_diem)

        // Đảo ngược giao dịch "Giao lịch":
        // - Người nhận lịch được hoàn lại điểm (cộng điểm)
        // - Người giao lịch bị trừ lại điểm
        diemNguoiNhanLich += soDiemHuy
        diemNguoiGiaoLich -= soDiemHuy

        // Cập nhật điểm cho người dùng từ giao dịch đối chứng
        await UserModel.updateDiem(idNguoiGiaoLich, diemNguoiGiaoLich, connection)
        await UserModel.updateDiem(idNguoiNhanLich, diemNguoiNhanLich, connection)

        // Cập nhật giá trị cuối cùng để tạo giao dịch hủy lịch
        // id_nguoi_gui = người giao lịch (người bị trừ điểm)
        // id_nguoi_nhan = người nhận lịch (người được hoàn lại điểm)
        finalIdNguoiGui = idNguoiGiaoLich
        finalIdNguoiNhan = idNguoiNhanLich
        finalSoDiem = soDiemHuy
      }

      // Cập nhật điểm cho người dùng (sử dụng connection từ transaction)
      // Chỉ cập nhật nếu không phải là giao dịch hủy lịch (vì đã cập nhật ở trên)
      // Và không phải là giao dịch "Giao lịch" (vì sẽ cập nhật khi chốt)
      if (tenLoai !== 'Hủy lịch' && tenLoai !== 'Giao lịch') {
        await UserModel.updateDiem(finalIdNguoiGui, diemNguoiGui, connection)
        await UserModel.updateDiem(finalIdNguoiNhan, diemNguoiNhan, connection)
      }

      // Xác định trạng thái mặc định:
      // - "San điểm": Mặc định là 'da_chot' (đã chốt, vì điểm được cộng/trừ ngay)
      // - "Giao lịch": Mặc định là 'chua_chot' (chưa chốt, sẽ chốt sau)
      // - "Hủy lịch": Mặc định là 'chua_chot' (chưa chốt)
      const trangThaiMacDinh = tenLoai === 'San điểm' ? 'da_chot' : 'chua_chot'

      // Tạo giao dịch
      const [result] = await connection.execute(
        'INSERT INTO giao_dich (id_nguoi_gui, id_nguoi_nhan, id_loai_giao_dich, so_diem_giao_dich, id_giao_dich_doi_chung, noi_dung_giao_dich, trang_thai) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [finalIdNguoiGui, finalIdNguoiNhan, id_loai_giao_dich, finalSoDiem, id_giao_dich_doi_chung || null, noi_dung_giao_dich || null, trangThaiMacDinh]
      )

      const giaoDichId = result.insertId

      // Tạo log (sử dụng connection từ transaction)
      await LogModel.create({
        id_giao_dich: giaoDichId,
        so_diem_con_lai_nguoi_nhan: diemNguoiNhan,
        so_diem_con_lai_nguoi_gui: diemNguoiGui
      }, connection)

      await connection.commit()

      // Lấy giao dịch vừa tạo
      const transaction = await TransactionModel.getById(giaoDichId)

      res.status(201).json({
        success: true,
        message: 'Tạo giao dịch thành công',
        data: transaction
      })
    } catch (error) {
      await connection.rollback()
      console.error('Create transaction error:', error)
      res.status(500).json({
        success: false,
        message: 'Lỗi khi tạo giao dịch',
        error: error.message
      })
    } finally {
      connection.release()
    }
  }

  // Tạo nhiều giao dịch cùng lúc
  static async createMany(req, res) {
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()

      const { transactions } = req.body

      if (!Array.isArray(transactions) || transactions.length === 0) {
        await connection.rollback()
        return res.status(400).json({
          success: false,
          message: 'Vui lòng cung cấp mảng giao dịch hợp lệ'
        })
      }

      const createdTransactions = []

      for (const txData of transactions) {
        const { id_nguoi_gui, id_nguoi_nhan, id_loai_giao_dich, so_diem_giao_dich, id_giao_dich_doi_chung, noi_dung_giao_dich } = txData

        // Validate
        if (!id_nguoi_gui || !id_nguoi_nhan || !id_loai_giao_dich || so_diem_giao_dich === undefined) {
          await connection.rollback()
          return res.status(400).json({
            success: false,
            message: 'Thiếu thông tin bắt buộc trong một hoặc nhiều giao dịch'
          })
        }

        if (id_nguoi_gui === id_nguoi_nhan) {
          await connection.rollback()
          return res.status(400).json({
            success: false,
            message: 'Người gửi và người nhận không thể là cùng một người'
          })
        }

        // Lấy thông tin loại giao dịch
        const loaiGiaoDich = await TransactionModel.getLoaiGiaoDichById(id_loai_giao_dich)
        if (!loaiGiaoDich) {
          await connection.rollback()
          return res.status(400).json({
            success: false,
            message: `Loại giao dịch ID ${id_loai_giao_dich} không hợp lệ`
          })
        }

        // Biến để lưu giá trị cuối cùng cho việc tạo giao dịch
        let finalIdNguoiGui = id_nguoi_gui
        let finalIdNguoiNhan = id_nguoi_nhan
        let finalSoDiem = parseFloat(so_diem_giao_dich)

        // Lấy thông tin người dùng
        const nguoiGui = await UserModel.getById(id_nguoi_gui)
        const nguoiNhan = await UserModel.getById(id_nguoi_nhan)

        if (!nguoiGui || !nguoiNhan) {
          await connection.rollback()
          return res.status(404).json({
            success: false,
            message: 'Không tìm thấy người dùng'
          })
        }

        let diemNguoiGui = parseFloat(nguoiGui.so_diem)
        let diemNguoiNhan = parseFloat(nguoiNhan.so_diem)

        // Xử lý logic theo loại giao dịch
        const tenLoai = loaiGiaoDich.ten_loai_giao_dich

        if (tenLoai === 'Giao lịch') {
          // Giao dịch "Giao lịch" mới tạo có trạng thái "chua_chot", KHÔNG cộng/trừ điểm
          // Điểm sẽ được cộng/trừ khi chuyển sang trạng thái "da_chot"
          // Không thay đổi điểm của người gửi và người nhận
        } else if (tenLoai === 'San điểm') {
          diemNguoiNhan += parseFloat(so_diem_giao_dich)
          diemNguoiGui -= parseFloat(so_diem_giao_dich)
        } else if (tenLoai === 'Hủy lịch') {
          if (!id_giao_dich_doi_chung) {
            await connection.rollback()
            return res.status(400).json({
              success: false,
              message: 'Giao dịch hủy lịch cần có id_giao_dich_doi_chung'
            })
          }

          const giaoDichDoiChung = await TransactionModel.getById(id_giao_dich_doi_chung)
          if (!giaoDichDoiChung) {
            await connection.rollback()
            return res.status(404).json({
              success: false,
              message: 'Không tìm thấy giao dịch đối chứng'
            })
          }

          if (giaoDichDoiChung.ten_loai_giao_dich !== 'Giao lịch') {
            await connection.rollback()
            return res.status(400).json({
              success: false,
              message: 'Giao dịch đối chứng phải là loại "Giao lịch"'
            })
          }

          // Lấy thông tin từ giao dịch đối chứng
          const idNguoiGiaoLich = giaoDichDoiChung.id_nguoi_gui // Người giao lịch (cần trừ điểm)
          const idNguoiNhanLich = giaoDichDoiChung.id_nguoi_nhan // Người nhận lịch (cần hoàn lại điểm)
          const soDiemHuy = parseFloat(giaoDichDoiChung.so_diem_giao_dich) // Số điểm từ giao dịch đối chứng

          // Lấy thông tin người dùng từ giao dịch đối chứng
          const nguoiGiaoLich = await UserModel.getById(idNguoiGiaoLich)
          const nguoiNhanLich = await UserModel.getById(idNguoiNhanLich)

          if (!nguoiGiaoLich || !nguoiNhanLich) {
            await connection.rollback()
            return res.status(404).json({
              success: false,
              message: 'Không tìm thấy người dùng từ giao dịch đối chứng'
            })
          }

          // Hoàn lại điểm cho người nhận lịch, trừ điểm của người giao lịch
          let diemNguoiGiaoLich = parseFloat(nguoiGiaoLich.so_diem)
          let diemNguoiNhanLich = parseFloat(nguoiNhanLich.so_diem)

          diemNguoiNhanLich += soDiemHuy
          diemNguoiGiaoLich -= soDiemHuy

          // Cập nhật điểm cho người dùng từ giao dịch đối chứng
          await UserModel.updateDiem(idNguoiGiaoLich, diemNguoiGiaoLich, connection)
          await UserModel.updateDiem(idNguoiNhanLich, diemNguoiNhanLich, connection)

          // Cập nhật giá trị cuối cùng để tạo giao dịch hủy lịch
          finalIdNguoiGui = idNguoiGiaoLich
          finalIdNguoiNhan = idNguoiNhanLich
          finalSoDiem = soDiemHuy
        }

        // Cập nhật điểm cho người dùng (sử dụng connection từ transaction)
        // Chỉ cập nhật nếu không phải là giao dịch hủy lịch (vì đã cập nhật ở trên)
        // Và không phải là giao dịch "Giao lịch" (vì sẽ cập nhật khi chốt)
        if (tenLoai !== 'Hủy lịch' && tenLoai !== 'Giao lịch') {
          await UserModel.updateDiem(finalIdNguoiGui, diemNguoiGui, connection)
          await UserModel.updateDiem(finalIdNguoiNhan, diemNguoiNhan, connection)
        }

        // Xác định trạng thái mặc định:
        // - "San điểm": Mặc định là 'da_chot' (đã chốt, vì điểm được cộng/trừ ngay)
        // - "Giao lịch": Mặc định là 'chua_chot' (chưa chốt, sẽ chốt sau)
        // - "Hủy lịch": Mặc định là 'chua_chot' (chưa chốt)
        const trangThaiMacDinh = tenLoai === 'San điểm' ? 'da_chot' : 'chua_chot'

        // Tạo giao dịch
        const [result] = await connection.execute(
          'INSERT INTO giao_dich (id_nguoi_gui, id_nguoi_nhan, id_loai_giao_dich, so_diem_giao_dich, id_giao_dich_doi_chung, noi_dung_giao_dich, trang_thai) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [finalIdNguoiGui, finalIdNguoiNhan, id_loai_giao_dich, finalSoDiem, id_giao_dich_doi_chung || null, noi_dung_giao_dich || null, trangThaiMacDinh]
        )

        const giaoDichId = result.insertId

        // Tạo log (sử dụng connection từ transaction)
        await LogModel.create({
          id_giao_dich: giaoDichId,
          so_diem_con_lai_nguoi_nhan: diemNguoiNhan,
          so_diem_con_lai_nguoi_gui: diemNguoiGui
        }, connection)

        // Lấy giao dịch vừa tạo
        const transaction = await TransactionModel.getById(giaoDichId)
        createdTransactions.push(transaction)
      }

      await connection.commit()

      res.status(201).json({
        success: true,
        message: `Tạo thành công ${createdTransactions.length} giao dịch`,
        data: createdTransactions
      })
    } catch (error) {
      await connection.rollback()
      console.error('Create many transactions error:', error)
      res.status(500).json({
        success: false,
        message: 'Lỗi khi tạo nhiều giao dịch',
        error: error.message
      })
    } finally {
      connection.release()
    }
  }

  // Cập nhật giao dịch
  static async update(req, res) {
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()

      const { id } = req.params
      const { id_nguoi_gui, id_nguoi_nhan, id_loai_giao_dich, so_diem_giao_dich, noi_dung_giao_dich } = req.body

      // Lấy giao dịch hiện tại
      const currentTransaction = await TransactionModel.getById(id)
      if (!currentTransaction) {
        await connection.rollback()
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy giao dịch'
        })
      }

      // Kiểm tra nếu giao dịch là "Hủy lịch", không cho phép sửa
      if (currentTransaction.ten_loai_giao_dich === 'Hủy lịch') {
        await connection.rollback()
        return res.status(400).json({
          success: false,
          message: 'Không thể sửa giao dịch "Hủy lịch"'
        })
      }

      // Xác định loại giao dịch mới
      const newLoaiGiaoDichId = id_loai_giao_dich !== undefined ? id_loai_giao_dich : currentTransaction.id_loai_giao_dich
      const newLoaiGiaoDich = await TransactionModel.getLoaiGiaoDichById(newLoaiGiaoDichId)
      
      if (!newLoaiGiaoDich) {
        await connection.rollback()
        return res.status(400).json({
          success: false,
          message: 'Loại giao dịch không hợp lệ'
        })
      }

      // Xác định người gửi/nhận mới
      const newNguoiGuiId = id_nguoi_gui !== undefined ? id_nguoi_gui : currentTransaction.id_nguoi_gui
      const newNguoiNhanId = id_nguoi_nhan !== undefined ? id_nguoi_nhan : currentTransaction.id_nguoi_nhan

      // Validate
      if (newNguoiGuiId === newNguoiNhanId) {
        await connection.rollback()
        return res.status(400).json({
          success: false,
          message: 'Người gửi và người nhận không thể là cùng một người'
        })
      }

      // Lấy thông tin người dùng mới
      const newNguoiGui = await UserModel.getById(newNguoiGuiId)
      const newNguoiNhan = await UserModel.getById(newNguoiNhanId)

      if (!newNguoiGui || !newNguoiNhan) {
        await connection.rollback()
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy người dùng'
        })
      }

      // Admin vẫn có thể sửa giao dịch
      // Cần hoàn lại điểm cũ trước khi áp dụng điểm mới
      const isDaChot = currentTransaction.trang_thai === 'da_chot'
      const oldLoaiGiaoDich = await TransactionModel.getLoaiGiaoDichById(currentTransaction.id_loai_giao_dich)
      const oldSoDiem = parseFloat(currentTransaction.so_diem_giao_dich)
      const newSoDiem = so_diem_giao_dich !== undefined ? parseFloat(so_diem_giao_dich) : oldSoDiem
      
      // Lưu điểm hiện tại của người mới (trước khi hoàn lại)
      let diemNguoiGuiAfterRollback = parseFloat(newNguoiGui.so_diem)
      let diemNguoiNhanAfterRollback = parseFloat(newNguoiNhan.so_diem)
      
      // Xác định cần hoàn lại điểm không:
      // - "San điểm": Luôn cần hoàn lại (vì điểm được cộng/trừ ngay khi tạo)
      // - "Giao lịch": Chỉ hoàn lại nếu đã chốt (vì chưa chốt thì chưa có điểm được cộng/trừ)
      const canHoanLaiDiemCu = (oldLoaiGiaoDich && oldLoaiGiaoDich.ten_loai_giao_dich === 'San điểm') ||
                                (isDaChot && oldLoaiGiaoDich && oldLoaiGiaoDich.ten_loai_giao_dich === 'Giao lịch')
      
      if (canHoanLaiDiemCu) {
        // Hoàn lại điểm cho giao dịch cũ (đảo ngược giao dịch cũ)
        const oldNguoiGuiId = currentTransaction.id_nguoi_gui
        const oldNguoiNhanId = currentTransaction.id_nguoi_nhan
        
        // Lấy điểm hiện tại của người cũ
        const oldNguoiGui = await UserModel.getById(oldNguoiGuiId)
        const oldNguoiNhan = await UserModel.getById(oldNguoiNhanId)
        
        if (oldNguoiGui && oldNguoiNhan) {
          let oldDiemNguoiGui = parseFloat(oldNguoiGui.so_diem)
          let oldDiemNguoiNhan = parseFloat(oldNguoiNhan.so_diem)
          
          if (oldLoaiGiaoDich.ten_loai_giao_dich === 'San điểm') {
            // Đảo ngược "San điểm": người nhận bị trừ lại, người gửi được cộng lại
            oldDiemNguoiNhan -= oldSoDiem
            oldDiemNguoiGui += oldSoDiem
          } else if (oldLoaiGiaoDich.ten_loai_giao_dich === 'Giao lịch') {
            // Đảo ngược "Giao lịch": người nhận được cộng lại, người gửi bị trừ lại
            oldDiemNguoiNhan += oldSoDiem
            oldDiemNguoiGui -= oldSoDiem
          }
          
          await UserModel.updateDiem(oldNguoiGuiId, oldDiemNguoiGui, connection)
          await UserModel.updateDiem(oldNguoiNhanId, oldDiemNguoiNhan, connection)
          
          // Cập nhật điểm của người mới nếu họ là người cũ (sau khi hoàn lại)
          if (newNguoiGuiId === oldNguoiGuiId) {
            diemNguoiGuiAfterRollback = oldDiemNguoiGui
          }
          if (newNguoiNhanId === oldNguoiNhanId) {
            diemNguoiNhanAfterRollback = oldDiemNguoiNhan
          }
        }
      }

      // Áp dụng điểm mới
      // - "San điểm": Luôn áp dụng (vì điểm được cộng/trừ ngay khi tạo, mặc định đã chốt)
      // - "Giao lịch": 
      //   + Chỉ áp dụng nếu đã chốt VÀ không phải đổi từ "San điểm" (vì đổi từ "San điểm" sang "Giao lịch" sẽ là chưa chốt)
      //   + Nếu đổi từ "Giao lịch" chưa chốt sang "Giao lịch" đã chốt: không áp dụng (vì chưa chốt)
      const isDoiTuSanDiem = oldLoaiGiaoDich && oldLoaiGiaoDich.ten_loai_giao_dich === 'San điểm'
      const canApDungDiemMoi = (newLoaiGiaoDich.ten_loai_giao_dich === 'San điểm') ||
                               (isDaChot && newLoaiGiaoDich.ten_loai_giao_dich === 'Giao lịch' && !isDoiTuSanDiem)
      
      if (canApDungDiemMoi) {
        // Nếu người mới khác người cũ, lấy lại điểm mới nhất từ database
        if (newNguoiGuiId !== currentTransaction.id_nguoi_gui) {
          const latestNguoiGui = await UserModel.getById(newNguoiGuiId)
          diemNguoiGuiAfterRollback = parseFloat(latestNguoiGui.so_diem)
        }
        if (newNguoiNhanId !== currentTransaction.id_nguoi_nhan) {
          const latestNguoiNhan = await UserModel.getById(newNguoiNhanId)
          diemNguoiNhanAfterRollback = parseFloat(latestNguoiNhan.so_diem)
        }
        
        if (newLoaiGiaoDich.ten_loai_giao_dich === 'San điểm') {
          // Áp dụng điểm mới cho "San điểm": người nhận được cộng điểm, người gửi bị trừ điểm
          diemNguoiNhanAfterRollback += newSoDiem
          diemNguoiGuiAfterRollback -= newSoDiem
        } else if (newLoaiGiaoDich.ten_loai_giao_dich === 'Giao lịch') {
          // Áp dụng điểm mới cho "Giao lịch": người nhận bị trừ điểm, người gửi được cộng điểm
          diemNguoiNhanAfterRollback -= newSoDiem
          diemNguoiGuiAfterRollback += newSoDiem
        }
        
        await UserModel.updateDiem(newNguoiGuiId, diemNguoiGuiAfterRollback, connection)
        await UserModel.updateDiem(newNguoiNhanId, diemNguoiNhanAfterRollback, connection)
      }

      // Xác định trạng thái mới:
      // - "San điểm": Luôn là 'da_chot' (đã chốt)
      // - "Giao lịch": 
      //   + Nếu đổi từ "San điểm" sang "Giao lịch": 'chua_chot' (chưa chốt)
      //   + Nếu vẫn là "Giao lịch" và đã chốt: giữ nguyên 'da_chot'
      //   + Nếu vẫn là "Giao lịch" và chưa chốt: giữ nguyên 'chua_chot'
      let newTrangThai = currentTransaction.trang_thai
      if (newLoaiGiaoDich.ten_loai_giao_dich === 'San điểm') {
        newTrangThai = 'da_chot'
      } else if (newLoaiGiaoDich.ten_loai_giao_dich === 'Giao lịch') {
        // Nếu đổi từ "San điểm" sang "Giao lịch", đặt về 'chua_chot'
        if (oldLoaiGiaoDich && oldLoaiGiaoDich.ten_loai_giao_dich === 'San điểm') {
          newTrangThai = 'chua_chot'
        }
        // Nếu vẫn là "Giao lịch", giữ nguyên trạng thái hiện tại
      }

      // Cập nhật giao dịch
      await TransactionModel.update(id, {
        id_nguoi_gui: newNguoiGuiId,
        id_nguoi_nhan: newNguoiNhanId,
        id_loai_giao_dich: newLoaiGiaoDichId,
        so_diem_giao_dich: newSoDiem,
        noi_dung_giao_dich: noi_dung_giao_dich !== undefined ? noi_dung_giao_dich : currentTransaction.noi_dung_giao_dich
      })

      // Cập nhật trạng thái nếu thay đổi
      if (newTrangThai !== currentTransaction.trang_thai) {
        await connection.execute(
          'UPDATE giao_dich SET trang_thai = ? WHERE id = ?',
          [newTrangThai, id]
        )
      }

      // Lấy lại giao dịch đã cập nhật
      const updatedTransaction = await TransactionModel.getById(id)

      await connection.commit()

      res.json({
        success: true,
        message: 'Cập nhật giao dịch thành công',
        data: updatedTransaction
      })
    } catch (error) {
      await connection.rollback()
      console.error('Update transaction error:', error)
      res.status(500).json({
        success: false,
        message: 'Lỗi khi cập nhật giao dịch',
        error: error.message
      })
    } finally {
      connection.release()
    }
  }

  // Xóa giao dịch và hoàn lại điểm
  static async delete(req, res) {
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()

      const { id } = req.params

      // Lấy giao dịch hiện tại
      const transaction = await TransactionModel.getById(id)
      if (!transaction) {
        await connection.rollback()
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy giao dịch'
        })
      }

      // Kiểm tra nếu giao dịch là "Hủy lịch", không cho phép xóa trực tiếp
      if (transaction.ten_loai_giao_dich === 'Hủy lịch') {
        await connection.rollback()
        return res.status(400).json({
          success: false,
          message: 'Không thể xóa giao dịch "Hủy lịch". Vui lòng xóa giao dịch "Giao lịch" tương ứng.'
        })
      }

      // Hoàn lại điểm trước khi xóa
      const loaiGiaoDich = await TransactionModel.getLoaiGiaoDichById(transaction.id_loai_giao_dich)
      const isDaChot = transaction.trang_thai === 'da_chot'
      
      // "San điểm": Điểm được cộng/trừ ngay khi tạo, nên luôn cần hoàn lại khi xóa
      // "Giao lịch": Chỉ hoàn lại nếu đã chốt (vì chưa chốt thì chưa có điểm được cộng/trừ)
      const canHoanLaiDiem = (loaiGiaoDich && loaiGiaoDich.ten_loai_giao_dich === 'San điểm') ||
                              (isDaChot && loaiGiaoDich && loaiGiaoDich.ten_loai_giao_dich === 'Giao lịch')
      
      if (canHoanLaiDiem) {
        const nguoiGui = await UserModel.getById(transaction.id_nguoi_gui)
        const nguoiNhan = await UserModel.getById(transaction.id_nguoi_nhan)
        
        if (nguoiGui && nguoiNhan) {
          const soDiem = parseFloat(transaction.so_diem_giao_dich)
          let diemNguoiGui = parseFloat(nguoiGui.so_diem)
          let diemNguoiNhan = parseFloat(nguoiNhan.so_diem)
          
          if (loaiGiaoDich.ten_loai_giao_dich === 'San điểm') {
            // Đảo ngược "San điểm": người nhận bị trừ lại, người gửi được cộng lại
            diemNguoiNhan -= soDiem
            diemNguoiGui += soDiem
          } else if (loaiGiaoDich.ten_loai_giao_dich === 'Giao lịch') {
            // Đảo ngược "Giao lịch": người nhận được cộng lại, người gửi bị trừ lại
            diemNguoiNhan += soDiem
            diemNguoiGui -= soDiem
          }
          
          await UserModel.updateDiem(transaction.id_nguoi_gui, diemNguoiGui, connection)
          await UserModel.updateDiem(transaction.id_nguoi_nhan, diemNguoiNhan, connection)
        }
      }

      // Xóa giao dịch
      await TransactionModel.delete(id, connection)

      await connection.commit()

      res.json({
        success: true,
        message: 'Xóa giao dịch thành công'
      })
    } catch (error) {
      await connection.rollback()
      console.error('Delete transaction error:', error)
      res.status(500).json({
        success: false,
        message: 'Lỗi khi xóa giao dịch',
        error: error.message
      })
    } finally {
      connection.release()
    }
  }

  // Chốt giao dịch (chuyển từ chưa chốt sang đã chốt và thực hiện cộng/trừ điểm)
  static async chotGiaoDich(req, res) {
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()

      const { id } = req.params

      // Lấy giao dịch hiện tại
      const transaction = await TransactionModel.getById(id)
      if (!transaction) {
        await connection.rollback()
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy giao dịch'
        })
      }

      // Kiểm tra trạng thái hiện tại
      if (transaction.trang_thai === 'da_chot') {
        await connection.rollback()
        return res.status(400).json({
          success: false,
          message: 'Giao dịch đã được chốt trước đó'
        })
      }

      // Chỉ cho phép chốt giao dịch "Giao lịch"
      if (transaction.ten_loai_giao_dich !== 'Giao lịch') {
        await connection.rollback()
        return res.status(400).json({
          success: false,
          message: 'Chỉ có thể chốt giao dịch loại "Giao lịch"'
        })
      }

      // Lấy thông tin người dùng
      const nguoiGui = await UserModel.getById(transaction.id_nguoi_gui)
      const nguoiNhan = await UserModel.getById(transaction.id_nguoi_nhan)

      if (!nguoiGui || !nguoiNhan) {
        await connection.rollback()
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy người dùng'
        })
      }

      // Thực hiện cộng/trừ điểm cho giao dịch "Giao lịch"
      // Người nhận bị trừ điểm, người gửi được cộng điểm
      let diemNguoiGui = parseFloat(nguoiGui.so_diem)
      let diemNguoiNhan = parseFloat(nguoiNhan.so_diem)
      const soDiem = parseFloat(transaction.so_diem_giao_dich)

      diemNguoiNhan -= soDiem
      diemNguoiGui += soDiem

      // Cập nhật điểm cho người dùng
      await UserModel.updateDiem(transaction.id_nguoi_gui, diemNguoiGui, connection)
      await UserModel.updateDiem(transaction.id_nguoi_nhan, diemNguoiNhan, connection)

      // Cập nhật trạng thái giao dịch sang "da_chot"
      await connection.execute(
        'UPDATE giao_dich SET trang_thai = ? WHERE id = ?',
        ['da_chot', id]
      )

      // Tạo log
      await LogModel.create({
        id_giao_dich: id,
        so_diem_con_lai_nguoi_nhan: diemNguoiNhan,
        so_diem_con_lai_nguoi_gui: diemNguoiGui
      }, connection)

      await connection.commit()

      // Lấy giao dịch đã cập nhật
      const updatedTransaction = await TransactionModel.getById(id)

      res.json({
        success: true,
        message: 'Chốt giao dịch thành công. Điểm đã được cập nhật.',
        data: updatedTransaction
      })
    } catch (error) {
      await connection.rollback()
      console.error('Chot giao dich error:', error)
      res.status(500).json({
        success: false,
        message: 'Lỗi khi chốt giao dịch',
        error: error.message
      })
    } finally {
      connection.release()
    }
  }

  // Chốt tất cả giao dịch "Giao lịch" chưa chốt
  static async chotTatCaGiaoDich(req, res) {
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()

      // Lấy tất cả giao dịch "Giao lịch" chưa chốt
      const [transactions] = await connection.execute(`
        SELECT gd.*, lg.ten_loai_giao_dich
        FROM giao_dich gd
        LEFT JOIN loai_giao_dich lg ON gd.id_loai_giao_dich = lg.id
        WHERE lg.ten_loai_giao_dich = 'Giao lịch' 
        AND gd.trang_thai = 'chua_chot'
        ORDER BY gd.created_at ASC
      `)

      if (transactions.length === 0) {
        await connection.rollback()
        return res.json({
          success: true,
          message: 'Không có giao dịch nào cần chốt',
          data: { count: 0 }
        })
      }

      let successCount = 0
      const errors = []

      for (const transaction of transactions) {
        try {
          // Lấy thông tin người dùng
          const nguoiGui = await UserModel.getById(transaction.id_nguoi_gui)
          const nguoiNhan = await UserModel.getById(transaction.id_nguoi_nhan)

          if (!nguoiGui || !nguoiNhan) {
            errors.push(`Giao dịch #${transaction.id}: Không tìm thấy người dùng`)
            continue
          }

          // Thực hiện cộng/trừ điểm cho giao dịch "Giao lịch"
          // Người nhận bị trừ điểm, người gửi được cộng điểm
          let diemNguoiGui = parseFloat(nguoiGui.so_diem)
          let diemNguoiNhan = parseFloat(nguoiNhan.so_diem)
          const soDiem = parseFloat(transaction.so_diem_giao_dich)

          diemNguoiNhan -= soDiem
          diemNguoiGui += soDiem

          // Cập nhật điểm cho người dùng
          await UserModel.updateDiem(transaction.id_nguoi_gui, diemNguoiGui, connection)
          await UserModel.updateDiem(transaction.id_nguoi_nhan, diemNguoiNhan, connection)

          // Cập nhật trạng thái giao dịch sang "da_chot"
          await connection.execute(
            'UPDATE giao_dich SET trang_thai = ? WHERE id = ?',
            ['da_chot', transaction.id]
          )

          // Tạo log
          await LogModel.create({
            id_giao_dich: transaction.id,
            so_diem_con_lai_nguoi_nhan: diemNguoiNhan,
            so_diem_con_lai_nguoi_gui: diemNguoiGui
          }, connection)

          successCount++
        } catch (error) {
          errors.push(`Giao dịch #${transaction.id}: ${error.message}`)
          console.error(`Error chot giao dich #${transaction.id}:`, error)
        }
      }

      if (successCount === 0 && errors.length > 0) {
        await connection.rollback()
        return res.status(400).json({
          success: false,
          message: 'Không thể chốt bất kỳ giao dịch nào',
          errors
        })
      }

      await connection.commit()

      res.json({
        success: true,
        message: `Đã chốt thành công ${successCount}/${transactions.length} giao dịch`,
        data: {
          count: successCount,
          total: transactions.length,
          errors: errors.length > 0 ? errors : undefined
        }
      })
    } catch (error) {
      await connection.rollback()
      console.error('Chot tat ca giao dich error:', error)
      res.status(500).json({
        success: false,
        message: 'Lỗi khi chốt tất cả giao dịch',
        error: error.message
      })
    } finally {
      connection.release()
    }
  }
}

export default TransactionController

