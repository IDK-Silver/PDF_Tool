//
// Created by a2882 on 2021/7/19.
//

#ifndef PDF_TOOL_MAINWINDOW_H
#define PDF_TOOL_MAINWINDOW_H

#include <QMainWindow>
#include <QString>
#include "src/Widget/PDFWidget/PDFWidget.h"
#include "libraries/Setting/Setting.h"


QT_BEGIN_NAMESPACE
namespace Ui { class MainWindow; }
QT_END_NAMESPACE

class MainWindow : public QMainWindow {
Q_OBJECT

public:
    explicit MainWindow(QWidget *parent = nullptr);

    ~MainWindow() override;

private:
    Ui::MainWindow *ui;
    Setting_Sections::PDF_Tool section;
    std::shared_ptr<Setting> settings = std::make_shared<Setting>(section.section);
    std::shared_ptr<PDFWidget> pdfWidget;

    void init();
};


#endif //PDF_TOOL_MAINWINDOW_H
