//
// Created by IDK-Silver on 2021/7/19.
//

// You may need to build the project (run Qt uic code generator) to get "ui_MainWindow.h" resolved

#include "MainWindow.h"
#include "ui_MainWindow.h"

MainWindow::MainWindow(QWidget *parent) : QMainWindow(parent), ui(new Ui::MainWindow)
{

    // init windwos and mainwindwos
    this->init();
    ui->setupUi(this);

    // generate widget and make pointer link
    this->pdfWidget = std::make_shared<PDFWidget>();
    this->pdfView_Widget = std::make_shared<PDFView_Widget>();

    //set main windows widget
    // setCentralWidget(pdfWidget->window());
    setCentralWidget(this->pdfView_Widget->window());
}

MainWindow::~MainWindow()
{
    delete ui;
}

void MainWindow::init()
{
    // check setting is generate if not will generate it : 檢查是否生成檔案
    if (!settings->is_file_generate())
    {
        // generate setting file : 生成設定檔案
        settings->generate_file();
        qDebug() << "Generate Setting File";
    }

    // check program version if not latest setting file will re generate : 檢查程式版本是否正確，版本不正確全部則重新生成
    if (settings->read(section.key.version) != APP_Version)
    {
        settings->generate_file();
        qDebug() << "Re Generate Setting File";
    }
}
