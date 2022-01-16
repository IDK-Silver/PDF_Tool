//
// Created by a2882 on 2021/7/19.
//

#ifndef PDF_TOOL_PDFWIDGET_H
#define PDF_TOOL_PDFWIDGET_H

#include <QWidget>
#include <QSet>
#include <QtConcurrent/QtConcurrent>
#include <QProgressDialog>
#include "libraries/Setting/Setting.h"

QT_BEGIN_NAMESPACE
namespace Ui
{
    class PDFWidget;
}
QT_END_NAMESPACE

class PDFWidget : public QWidget
{
    Q_OBJECT

public:
    explicit PDFWidget(QWidget *parent = nullptr);
    ~PDFWidget() override;

private:
    Ui::PDFWidget *ui;
    Setting *settings{};
    Setting_Sections::PDFWidget section;
    QVector<QString> files;
    QFutureWatcher<bool> watcher;
    QProgressDialog *progressDialog{};

    void init(); //初始化介面選項 & 各項參數

private slots:
    void add_file();
    void del_file();
    void conversion();
};

#endif //PDF_TOOL_PDFWIDGET_H
