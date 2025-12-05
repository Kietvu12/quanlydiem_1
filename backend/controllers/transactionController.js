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

      let diemNguoiGui = parseFloat(nguoiGui.so_diem)
      let diemNguoiNhan = parseFloat(nguoiNhan.so_diem)

      // Xử lý logic theo loại giao dịch
      const tenLoai = loaiGiaoDich.ten_loai_giao_dich

      if (tenLoai === 'Giao lịch') {
        // Người nhận bị trừ điểm, người gửi được cộng điểm
        diemNguoiNhan -= parseFloat(so_diem_giao_dich)
        diemNguoiGui += parseFloat(so_diem_giao_dich)
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

        // Đảo ngược: người nhận được cộng lại điểm, người gửi bị trừ lại điểm
        diemNguoiNhan += parseFloat(so_diem_giao_dich)
        diemNguoiGui -= parseFloat(so_diem_giao_dich)
      }

      // Cập nhật điểm cho người dùng (sử dụng connection từ transaction)
      await UserModel.updateDiem(id_nguoi_gui, diemNguoiGui, connection)
      await UserModel.updateDiem(id_nguoi_nhan, diemNguoiNhan, connection)

      // Tạo giao dịch
      const [result] = await connection.execute(
        'INSERT INTO giao_dich (id_nguoi_gui, id_nguoi_nhan, id_loai_giao_dich, so_diem_giao_dich, id_giao_dich_doi_chung, noi_dung_giao_dich) VALUES (?, ?, ?, ?, ?, ?)',
        [id_nguoi_gui, id_nguoi_nhan, id_loai_giao_dich, so_diem_giao_dich, id_giao_dich_doi_chung || null, noi_dung_giao_dich || null]
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
          diemNguoiNhan -= parseFloat(so_diem_giao_dich)
          diemNguoiGui += parseFloat(so_diem_giao_dich)
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

          diemNguoiNhan += parseFloat(so_diem_giao_dich)
          diemNguoiGui -= parseFloat(so_diem_giao_dich)
        }

        // Cập nhật điểm cho người dùng (sử dụng connection từ transaction)
        await UserModel.updateDiem(id_nguoi_gui, diemNguoiGui, connection)
        await UserModel.updateDiem(id_nguoi_nhan, diemNguoiNhan, connection)

        // Tạo giao dịch
        const [result] = await connection.execute(
          'INSERT INTO giao_dich (id_nguoi_gui, id_nguoi_nhan, id_loai_giao_dich, so_diem_giao_dich, id_giao_dich_doi_chung, noi_dung_giao_dich) VALUES (?, ?, ?, ?, ?, ?)',
          [id_nguoi_gui, id_nguoi_nhan, id_loai_giao_dich, so_diem_giao_dich, id_giao_dich_doi_chung || null, noi_dung_giao_dich || null]
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
}

export default TransactionController

