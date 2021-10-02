//
// Created by a2882 on 2021/7/19.
//

#include "PDFtoImage.h"
#include <QDir>
#include <QtConcurrent/QtConcurrent>
#include <QDebug>
#include <memory>

PDFtoImage::PDFtoImage(const QString& file_path)
{
    this->max_cpu_core = QThread::idealThreadCount();
    QThreadPool::globalInstance()->setMaxThreadCount(QThread::idealThreadCount());

    qDebug() << "Max Thread " << this->max_cpu_core;

    std::shared_ptr<Poppler::Document> input_document(Poppler::Document::load(file_path));  //讀取文件
    this->document = std::move(input_document);

    this->num_pages = this->document->numPages();   // 紀錄頁數

    if (this->document->isLocked()) {   // 偵測PDF有沒有密碼
        qDebug() << "PDF file is lock";
        return;
    }
}

PDFtoImage::~PDFtoImage() = default;

void PDFtoImage::conversion_image(const QString& output_path, const QString& file_name, int image_dpi, const QString& image_format) {

    this->conversion_data.output_path = output_path;
    this->conversion_data.file_name = file_name;
    this->conversion_data.image_dpi = image_dpi;
    this->conversion_data.image_format = image_format;

    if (this->document->numPages() > this->max_cpu_core) {
        // 紀錄轉換的頁數
        int index = 0;

        // 紀錄有幾輪要跑 每一輪會轉換最大允許的CPU核心數
        int step = this->document->numPages() / this->max_cpu_core;

        // 紀錄剩餘要轉換得的
        int over = this->document->numPages() - (step * this->max_cpu_core);

        // 紀錄執行續的狀況
        QVector<QFuture<void>> futures;

        //對應每輪轉換
        for (int now_step = 0; now_step < step; now_step++) {

            // 對應最大允許的CPU核心進行轉換
            for (int core = 0; core < this->max_cpu_core; core++) {
                auto future = QtConcurrent::run(this, &PDFtoImage::conversion_image_one, this->document, index, conversion_data);

                // 添加紀錄
                futures.append(future);

                // 頁數加一
                index++;
            }

            // 等帶每一的線程轉換完成
            for (int core = 0; core< this->max_cpu_core; core++) {
                // 取出紀錄
                auto future = futures.at(core);
                qDebug() << QString("Wait Core %1").arg(core);

                // 等待完成
                future.waitForFinished();
            }
            qDebug() << QString("Next step");

            //清除紀錄
            futures.clear();

        }

        // 執行剩餘的頁數
        for (int last = 0; last < over; last++) {
            auto future =  QtConcurrent::run(this, &PDFtoImage::conversion_image_one, this->document,  index, conversion_data);
            futures.push_back(future);
            index++;
        }

        for (auto future : futures) {
            future.waitForFinished();
        }

    }
    // 如果PDF頁數小於最大核心數
    else {
        // 紀錄執行續的狀況
        QVector<QFuture<void>> futures;

        for (int index = 0; index < this->document->numPages(); index++) {
            //        conversion_image_one(index, conversion_data);
            auto future = QtConcurrent::run(this, &PDFtoImage::conversion_image_one, this->document,  index, conversion_data);
            futures.push_back(future);
        }

        for (auto future : futures) {
            future.waitForFinished();
        }
    }



}

void PDFtoImage::conversion_image_one(const std::shared_ptr<Poppler::Document>& pointer_document, int index, const conversionData &data) {
    // 轉換為 QImage以進行存檔
    const QImage image = this->document->page(index)->renderToImage(data.image_dpi, data.image_dpi);

    qDebug() << QString("Render To Image Success Page %1").arg(index + 1);

    switch (this->num_pages)
    {
        // 如果PDF全部只有一頁。
        case 1:
            image.save(QDir(data.output_path + QDir::separator() + data.file_name + "." + data.image_format.toLower()).path());
            break;

        default:
            image.save(QDir(data.output_path + QDir::separator()
            + QString(data.file_name + "-%1." + data.image_format.toLower()).arg(QString::number(index + 1))).path());
            break;
    }
}



